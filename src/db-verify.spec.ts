/**
 * 실 DB 통합 검증. 기본 실행에서는 건너뛴다.
 *   RUN_DB_TESTS=1 npm test -- db-verify
 *
 * 목킹 없이 실제 Prisma/트랜잭션을 때려 다음을 확인한다:
 *   - 포크 트랜잭션(forkCount 증가 + 사본 성적 미상속)
 *   - Decimal 증분(scoreSumPercent)
 *   - 복합 키 upsert(questionChoiceStat)
 *   - updateMany 밀어내기(displayOrder 중간 삽입)
 *   - 제출 시 카운터 3종 갱신
 *   - choices 수정 시 통계 리셋
 *
 * 생성한 행은 afterAll에서 전부 지운다(고유 접두사 사용).
 */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { WorkbooksService } from '@/modules/workbooks/workbooks.service';
import { QuestionsService } from '@/modules/questions/questions.service';
import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';
import { UpdateQuestionDto } from '@/modules/questions/dto/update-question.dto';

const RUN = process.env.RUN_DB_TESTS === '1';
const d = RUN ? describe : describe.skip;

const P = 'dbv-'; // 정리용 접두사
const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const choices = () => [
  { id: 'c1', content: doc('보기 1'), isCorrect: true },
  { id: 'c2', content: doc('보기 2'), isCorrect: false },
  { id: 'c3', content: doc('보기 3'), isCorrect: false },
];

d('실 DB 통합 검증', () => {
  let prisma: PrismaService;
  let workbooks: WorkbooksService;
  let questions: QuestionsService;
  let sessions: ExamSessionsService;

  const userId = `${P}user`;
  const otherId = `${P}other`;
  const subjA = `${P}subjA`;
  const subjB = `${P}subjB`;
  const qIds = [`${P}q1`, `${P}q2`, `${P}q3`];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PrismaService,
        WorkbooksService,
        QuestionsService,
        ExamSessionsService,
        { provide: GeminiLlmService, useValue: {} },
      ],
    }).compile();
    await module.init();

    prisma = module.get(PrismaService);
    workbooks = module.get(WorkbooksService);
    questions = module.get(QuestionsService);
    sessions = module.get(ExamSessionsService);

    await cleanup();

    await prisma.user.createMany({
      data: [
        { id: userId, email: `${P}a@t.io`, passwordHash: 'x', nickname: '검증' },
        { id: otherId, email: `${P}b@t.io`, passwordHash: 'x', nickname: '타인' },
      ],
    });
    // 교차 과목 검증을 위해 소분류 2개 (같은 시험/대분류, 다른 이름)
    await prisma.subject.createMany({
      data: [
        { id: subjA, examType: `${P}수능`, examCategory: '국어', name: '문학' },
        { id: subjB, examType: `${P}수능`, examCategory: '수학', name: '미적분' },
      ],
    });
    await prisma.question.createMany({
      data: qIds.map((id, i) => ({
        id,
        creatorId: userId,
        subjectId: i === 2 ? subjB : subjA, // q3만 다른 과목
        questionType: '객관식',
        stem: doc(`문항 ${i + 1}`) as never,
        choices: choices() as never,
        status: 'PUBLISHED',
        points: 1,
      })),
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma?.$disconnect();
  }, 60_000);

  async function cleanup() {
    // FK 순서대로. 접두사로만 삭제해 기존 데이터를 건드리지 않는다.
    await prisma.examSessionAnswer.deleteMany({
      where: { examSessionQuestion: { examSession: { userId: { startsWith: P } } } },
    });
    await prisma.examSessionQuestion.deleteMany({ where: { examSession: { userId: { startsWith: P } } } });
    await prisma.examSession.deleteMany({ where: { userId: { startsWith: P } } });
    await prisma.workbookQuestion.deleteMany({ where: { workbook: { ownerId: { startsWith: P } } } });
    await prisma.workbook.deleteMany({ where: { ownerId: { startsWith: P } } });
    await prisma.questionChoiceStat.deleteMany({ where: { questionId: { startsWith: P } } });
    await prisma.question.deleteMany({ where: { creatorId: { startsWith: P } } });
    await prisma.subject.deleteMany({ where: { id: { startsWith: P } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
  }

  it('문제집 생성 시 questionCount 캐시가 맞는다', async () => {
    const wb = await workbooks.create({ title: 'WB', questionIds: [qIds[0], qIds[1]] }, userId);
    const row = await prisma.workbook.findUniqueOrThrow({ where: { id: wb.id } });
    expect(row.questionCount).toBe(2);
    expect(row.visibility).toBe('PRIVATE');
    expect(row.attemptCount).toBe(0);
  }, 60_000);

  it('중간 삽입이 뒤 문항을 밀어낸다 (updateMany, displayOrder 중복 없음)', async () => {
    const wb = await workbooks.create({ title: 'ORD', questionIds: [qIds[0], qIds[1]] }, userId);
    // 현재: q1=0, q2=1 → q3를 0번에 삽입
    await workbooks.addQuestion(wb.id, { questionId: qIds[2], displayOrder: 0 }, userId);

    const rows = await prisma.workbookQuestion.findMany({
      where: { workbookId: wb.id },
      orderBy: { displayOrder: 'asc' },
    });
    expect(rows.map((r) => [r.questionId, r.displayOrder])).toEqual([
      [qIds[2], 0],
      [qIds[0], 1],
      [qIds[1], 2],
    ]);
    const wbRow = await prisma.workbook.findUniqueOrThrow({ where: { id: wb.id } });
    expect(wbRow.questionCount).toBe(3);
  }, 60_000);

  it('같은 문항 중복 담기는 409', async () => {
    const wb = await workbooks.create({ title: 'DUP', questionIds: [qIds[0]] }, userId);
    await expect(workbooks.addQuestion(wb.id, { questionId: qIds[0] }, userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  }, 60_000);

  it('포크: forkCount 증가 + 사본은 PRIVATE, 성적 미상속', async () => {
    const src = await workbooks.create(
      { title: 'SRC', visibility: 'PUBLIC', questionIds: [qIds[0], qIds[1]] },
      userId,
    );
    // 원본에 가짜 성적을 심어 사본이 물려받지 않는지 본다.
    await prisma.workbook.update({
      where: { id: src.id },
      data: { attemptCount: 3, scoreSumPercent: 240 },
    });

    const copy = await workbooks.fork(src.id, otherId);
    const copyRow = await prisma.workbook.findUniqueOrThrow({ where: { id: copy.id } });
    const srcRow = await prisma.workbook.findUniqueOrThrow({ where: { id: src.id } });

    expect(srcRow.forkCount).toBe(1);
    expect(copyRow.ownerId).toBe(otherId);
    expect(copyRow.visibility).toBe('PRIVATE');
    expect(copyRow.forkedFromId).toBe(src.id);
    expect(copyRow.questionCount).toBe(2);
    expect(copyRow.attemptCount).toBe(0);
    expect(copyRow.scoreSumPercent.toNumber()).toBe(0);
    // 담긴 문항은 출처를 기록한다
    const picked = await prisma.workbookQuestion.findMany({ where: { workbookId: copy.id } });
    expect(picked.every((p) => p.sourceWorkbookId === src.id)).toBe(true);
  }, 60_000);

  it('소유자 조회는 viewCount를 올리지 않고, 타인 조회는 올린다', async () => {
    const wb = await workbooks.create({ title: 'VIEW', visibility: 'PUBLIC' }, userId);

    await workbooks.findOne(wb.id, userId);
    expect((await prisma.workbook.findUniqueOrThrow({ where: { id: wb.id } })).viewCount).toBe(0);

    const seen = await workbooks.findOne(wb.id, otherId);
    expect((await prisma.workbook.findUniqueOrThrow({ where: { id: wb.id } })).viewCount).toBe(1);
    // 응답에 증가된 값이 실린다(1 뒤처지지 않는다)
    expect((seen as { viewCount: number }).viewCount).toBe(1);
  }, 60_000);

  it('교차 과목 세션 + 제출 → 카운터 3종 + 문제집 평균점수(Decimal) 갱신', async () => {
    const wb = await workbooks.create(
      { title: 'PLAY', questionIds: [qIds[0], qIds[2]] }, // 국어 + 수학
      userId,
    );

    // subjectId 없이 교차 과목 플레이리스트 (예전에는 조용히 버려졌다)
    const session = await sessions.create(userId, {
      questionIds: [qIds[0], qIds[2]],
      workbookId: wb.id,
    });
    // 교차 과목 2문항이 모두 살아남아야 한다(예전엔 다른 과목이 조용히 버려졌다).
    expect(session.questionCount).toBe(2);

    const sqs = await prisma.examSessionQuestion.findMany({
      where: { examSessionId: session.id },
      orderBy: { displayOrder: 'asc' },
    });

    // 1번은 정답(c1), 2번은 오답(c3). 시간 기록 포함.
    await sessions.submitAnswer(sqs[0].id, userId, { selectedChoiceIds: ['c1'], timeSpentSec: 20 });
    await sessions.submitAnswer(sqs[1].id, userId, { selectedChoiceIds: ['c3'], timeSpentSec: 40 });

    const result = await sessions.submit(session.id, userId);
    expect(result.correct).toBe(1);
    expect(result.scorePercent).toBe(50);

    const q1 = await prisma.question.findUniqueOrThrow({ where: { id: qIds[0] } });
    expect(q1.totalSolvedCount).toBe(1);
    expect(q1.correctSolvedCount).toBe(1);
    expect(q1.timedSolvedCount).toBe(1);
    expect(q1.totalTimeSpentSec).toBe(20);

    // 선지 분포 upsert (복합 키)
    const stat = await prisma.questionChoiceStat.findUniqueOrThrow({
      where: { questionId_choiceId: { questionId: qIds[2], choiceId: 'c3' } },
    });
    expect(stat.count).toBe(1);

    // 문제집 평균 점수: Decimal 증분
    const wbRow = await prisma.workbook.findUniqueOrThrow({ where: { id: wb.id } });
    expect(wbRow.attemptCount).toBe(1);
    expect(wbRow.scoreSumPercent.toNumber()).toBe(50);
    expect((await workbooks.findOne(wb.id, otherId).catch(() => null))).toBeNull(); // PRIVATE
  }, 90_000);

  it('교차 과목 플레이리스트에 미발행 문항이 섞이면 400으로 거부한다', async () => {
    const draft = await prisma.question.create({
      data: {
        id: `${P}draft`,
        creatorId: userId,
        subjectId: subjA,
        questionType: '객관식',
        stem: doc('초안') as never,
        choices: choices() as never,
        status: 'DRAFT',
      },
    });
    await expect(
      sessions.create(userId, { questionIds: [qIds[0], draft.id] }),
    ).rejects.toThrow(/발행되지 않았거나/);
    await prisma.question.delete({ where: { id: draft.id } });
  }, 60_000);

  it('getStats: 분포 + 표본 미달 시 비율 숨김', async () => {
    const stats = await questions.getStats(qIds[2]);
    expect(stats.totalSolved).toBe(1);
    expect(stats.correctRate).toBeNull(); // 표본 1 < 10
    expect(stats.avgTimeSpentSec).toBeNull();
    const c3 = stats.choiceDistribution.find((c) => c.choiceId === 'c3');
    expect(c3).toMatchObject({ index: 2, count: 1, isCorrect: false });
  }, 60_000);

  it('재배열: 전체 순서를 통째로 보내면 displayOrder가 0..n-1로 다시 매겨진다', async () => {
    const wb = await workbooks.create({ title: 'RE', questionIds: [qIds[0], qIds[1], qIds[2]] }, userId);

    await workbooks.reorderQuestions(wb.id, [qIds[2], qIds[0], qIds[1]], userId);

    const rows = await prisma.workbookQuestion.findMany({
      where: { workbookId: wb.id },
      orderBy: { displayOrder: 'asc' },
    });
    expect(rows.map((r) => [r.questionId, r.displayOrder])).toEqual([
      [qIds[2], 0],
      [qIds[0], 1],
      [qIds[1], 2],
    ]);
  }, 60_000);

  it('재배열: 문항이 빠지거나 남의 문항이 섞이면 400', async () => {
    const wb = await workbooks.create({ title: 'RE2', questionIds: [qIds[0], qIds[1]] }, userId);

    // 하나 누락
    await expect(workbooks.reorderQuestions(wb.id, [qIds[0]], userId)).rejects.toThrow(/빠짐없이/);
    // 문제집에 없는 문항
    await expect(
      workbooks.reorderQuestions(wb.id, [qIds[0], qIds[1], qIds[2]], userId),
    ).rejects.toThrow(/빠짐없이/);
    // 중복
    await expect(
      workbooks.reorderQuestions(wb.id, [qIds[0], qIds[0]], userId),
    ).rejects.toThrow(/중복/);
  }, 60_000);

  it('바로 풀기: displayOrder 순서로 세션을 만든다', async () => {
    const wb = await workbooks.create({ title: 'START', questionIds: [qIds[0], qIds[1]] }, userId);

    const started = await workbooks.startSession(wb.id, userId);
    expect(started.questionCount).toBe(2);
    expect(started.skippedQuestionIds).toEqual([]);

    const session = await prisma.examSession.findUniqueOrThrow({ where: { id: started.id } });
    expect(session.workbookId).toBe(wb.id);
    expect(session.subjectId).toBeNull(); // 문제집 응시는 교차 과목
  }, 90_000);

  it('바로 풀기: 원저자가 내린 문항은 제외하되 조용히 버리지 않는다', async () => {
    const wb = await workbooks.create({ title: 'ARCH', questionIds: [qIds[0], qIds[1]] }, userId);

    // 담기는 "참조"라 원저자가 내리면 문제집에 죽은 문항이 남는다.
    await prisma.question.update({ where: { id: qIds[1] }, data: { status: 'ARCHIVED' } });
    try {
      const started = await workbooks.startSession(wb.id, userId);
      expect(started.questionCount).toBe(1);
      expect(started.skippedQuestionIds).toEqual([qIds[1]]); // 명시적으로 알린다
    } finally {
      await prisma.question.update({ where: { id: qIds[1] }, data: { status: 'PUBLISHED' } });
    }
  }, 90_000);

  it('바로 풀기: 풀 수 있는 문항이 하나도 없으면 400', async () => {
    const wb = await workbooks.create({ title: 'EMPTY', questionIds: [qIds[0]] }, userId);
    await prisma.question.update({ where: { id: qIds[0] }, data: { status: 'ARCHIVED' } });
    try {
      await expect(workbooks.startSession(wb.id, userId)).rejects.toThrow(/발행된\) 문항이 없습니다/);
    } finally {
      await prisma.question.update({ where: { id: qIds[0] }, data: { status: 'PUBLISHED' } });
    }
  }, 90_000);

  it('choices 수정 → 통계 리셋 (원본 응시 기록은 보존)', async () => {
    const before = await prisma.examSessionAnswer.count({
      where: { examSessionQuestion: { questionId: qIds[2] } },
    });
    expect(before).toBeGreaterThan(0);

    await questions.update(qIds[2], userId, { choices: choices() } as unknown as UpdateQuestionDto);

    const q = await prisma.question.findUniqueOrThrow({ where: { id: qIds[2] } });
    expect(q.totalSolvedCount).toBe(0);
    expect(q.timedSolvedCount).toBe(0);
    expect(await prisma.questionChoiceStat.count({ where: { questionId: qIds[2] } })).toBe(0);

    // 응시 원본은 그대로
    const after = await prisma.examSessionAnswer.count({
      where: { examSessionQuestion: { questionId: qIds[2] } },
    });
    expect(after).toBe(before);
  }, 60_000);
});
