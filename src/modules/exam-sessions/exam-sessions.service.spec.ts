import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ExamSessionsService } from './exam-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { XP_RULES } from '@/common/constants/xp';

/**
 * readChoiceIds는 Json 컬럼(selected_choice_ids)을 읽는 방어 로직이다.
 * DB가 무엇을 담고 있든 선지 분포 카운터를 오염시키지 않아야 한다.
 */
describe('ExamSessionsService.readChoiceIds', () => {
  let read: (raw: unknown) => string[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [ExamSessionsService, { provide: PrismaService, useValue: {} }, { provide: GeminiLlmService, useValue: {} }],
    }).compile();
    const service = module.get(ExamSessionsService);
    // private 헬퍼 — 분포 집계의 유일한 입력 정제 지점이라 직접 검증한다.
    read = (raw: unknown) => (service as unknown as { readChoiceIds(r: unknown): string[] }).readChoiceIds(raw);
  });

  it('문자열 배열을 그대로 통과시킨다', () => {
    expect(read(['c1', 'c3'])).toEqual(['c1', 'c3']);
  });

  it('중복 선택을 한 번만 센다 (분포 부풀리기 방지)', () => {
    expect(read(['c2', 'c2', 'c2'])).toEqual(['c2']);
  });

  it('배열이 아니면 빈 배열 (null / 객체 / 숫자)', () => {
    expect(read(null)).toEqual([]);
    expect(read(undefined)).toEqual([]);
    expect(read({ c1: true })).toEqual([]);
    expect(read(42)).toEqual([]);
  });

  it('배열 안의 비문자열·빈문자열을 걸러낸다', () => {
    expect(read(['c1', 3, null, '', { id: 'c2' }, 'c4'])).toEqual(['c1', 'c4']);
  });
});

/**
 * 필터 모드의 하위요소(subjectDetailId) 필터 — 약점 진단(#37) 선행 작업.
 * relationMode="prisma"라 DB FK가 없으므로, 하위요소가 요청 subjectId 소속인지는
 * create()의 앱단 검증이 유일한 방어선이다.
 */
describe('ExamSessionsService.create — 하위요소(subjectDetailId) 필터', () => {
  async function makeService(prisma: Record<string, unknown>) {
    const module = await Test.createTestingModule({
      providers: [
        ExamSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiLlmService, useValue: {} },
      ],
    }).compile();
    return module.get(ExamSessionsService);
  }

  it('하위요소가 요청 subjectId 소속이 아니면 400으로 거부한다', async () => {
    const service = await makeService({
      subject: { findUnique: jest.fn().mockResolvedValue({ id: 'sub1' }) },
      // d1은 다른 과목(sub2) 소속 — 조합 모순.
      subjectDetail: { findUnique: jest.fn().mockResolvedValue({ subjectId: 'sub2' }) },
    });

    await expect(
      service.create('u1', {
        subjectId: 'sub1',
        questionCount: 5,
        filter: { subjectDetailId: 'd1' },
      } as CreateSessionDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('존재하지 않는 하위요소면 404로 거부한다', async () => {
    const service = await makeService({
      subject: { findUnique: jest.fn().mockResolvedValue({ id: 'sub1' }) },
      subjectDetail: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.create('u1', {
        subjectId: 'sub1',
        questionCount: 5,
        filter: { subjectDetailId: 'd-none' },
      } as CreateSessionDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('buildQuestionWhere가 subjectDetailId를 기존 필터(유형·난이도·태그)와 조합한다', async () => {
    const service = await makeService({});
    const where = (
      service as unknown as { buildQuestionWhere(dto: CreateSessionDto): Record<string, unknown> }
    ).buildQuestionWhere({
      subjectId: 'sub1',
      questionCount: 5,
      filter: {
        subjectDetailId: 'd1',
        questionTypes: ['객관식'],
        minDifficulty: 2,
        maxDifficulty: 4,
        tagIds: ['t1'],
      },
    } as CreateSessionDto);

    expect(where).toEqual({
      status: 'PUBLISHED',
      subjectId: 'sub1',
      subjectDetailId: 'd1',
      questionType: { in: ['객관식'] },
      difficulty: { gte: 2, lte: 4 },
      questionTags: { some: { tagId: { in: ['t1'] } } },
    });
  });

  it('subjectDetailId가 없으면 where에 키 자체가 들어가지 않는다', async () => {
    const service = await makeService({});
    const where = (
      service as unknown as { buildQuestionWhere(dto: CreateSessionDto): Record<string, unknown> }
    ).buildQuestionWhere({ subjectId: 'sub1', questionCount: 5 } as CreateSessionDto);

    expect('subjectDetailId' in where).toBe(false);
  });

  /**
   * 서술형 전용 세트 (#33 잔여 2). 서술형 득점률 축의 "공략" 버튼이 쓰는 조건이라
   * 모집단이 득점률 지표와 같아야 한다 — 셋 중 하나라도 빠지면 다른 문항이 섞인다.
   */
  it('rubricOnly가 주관식·기준표 있음·단답 정답 없음 세 조건을 모두 건다', async () => {
    const service = await makeService({});
    const where = (
      service as unknown as { buildQuestionWhere(dto: CreateSessionDto): Record<string, unknown> }
    ).buildQuestionWhere({
      subjectId: 'sub1',
      questionCount: 5,
      filter: { subjectDetailId: 'd1', rubricOnly: true },
    } as CreateSessionDto);

    expect(where.AND).toEqual([
      { questionType: '주관식' },
      { rubric: { not: Prisma.DbNull } },
      { OR: [{ correctAnswerText: null }, { correctAnswerText: '' }] },
    ]);
    expect(where.subjectDetailId).toBe('d1');
  });

  it('rubricOnly는 questionTypes를 덮어쓰지 않는다 — 모순된 조합은 빈 결과로 답한다', async () => {
    const service = await makeService({});
    const where = (
      service as unknown as { buildQuestionWhere(dto: CreateSessionDto): Record<string, unknown> }
    ).buildQuestionWhere({
      subjectId: 'sub1',
      questionCount: 5,
      filter: { questionTypes: ['객관식'], rubricOnly: true },
    } as CreateSessionDto);

    // 요청한 '객관식'이 그대로 남고, AND가 '주관식'을 더해 교집합이 빈다.
    expect(where.questionType).toEqual({ in: ['객관식'] });
    expect(where.AND).toContainEqual({ questionType: '주관식' });
  });

  it('rubricOnly가 없으면 AND 키 자체가 들어가지 않는다', async () => {
    const service = await makeService({});
    const where = (
      service as unknown as { buildQuestionWhere(dto: CreateSessionDto): Record<string, unknown> }
    ).buildQuestionWhere({ subjectId: 'sub1', questionCount: 5 } as CreateSessionDto);

    expect('AND' in where).toBe(false);
  });
});

/**
 * 데일리 챌린지(+50) 지급 게이트 회귀 테스트.
 *
 * 비즈니스 규칙: 당일 첫 채점 제출(st.counted === true)에만 고정 50 XP, 부스터 미적용.
 * 같은 날 두 번째 제출부터는 0. st.counted는 lastActiveDate 대비 now로 결정되므로,
 * 그 둘만 조작하고 정답·콤보·취약(solve/combo/weak)을 0으로 두면 gained == dailyXp가 되어
 * 데일리 보너스만 고립 검증할 수 있다. tx는 user.findUnique/update만 스텁하면 충분하다.
 */
describe('ExamSessionsService.awardForSubmit — 데일리 챌린지 게이트', () => {
  let service: ExamSessionsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      // awardForSubmit은 tx를 인자로 받으므로 PrismaService 자체는 쓰지 않는다 → 빈 스텁.
      providers: [ExamSessionsService, { provide: PrismaService, useValue: {} }, { provide: GeminiLlmService, useValue: {} }],
    }).compile();
    service = module.get(ExamSessionsService);
  });

  /**
   * 최소 tx 스텁 — user.findUnique/update + 원장/마일스톤 기록(recordXpEvent가 호출).
   * xpHistory.create / milestoneAchievement.createMany도 스텁해야 recordXpEvent가 에러 없이 돈다.
   */
  function makeTx(user: Record<string, unknown>) {
    const update = jest.fn().mockResolvedValue({});
    const xpHistoryCreate = jest.fn().mockResolvedValue({});
    const milestoneCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    // 보호권 미보유(quantity 조회 null) — 스트릭 방어 분기는 별도 스펙에서 검증.
    const inventoryFindUnique = jest.fn().mockResolvedValue(null);
    const inventoryUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update },
      xpHistory: { create: xpHistoryCreate },
      milestoneAchievement: { createMany: milestoneCreateMany },
      userInventory: { findUnique: inventoryFindUnique, update: inventoryUpdate },
    };
    return { tx, update, xpHistoryCreate, milestoneCreateMany, inventoryFindUnique, inventoryUpdate };
  }

  /** private 메서드 직접 호출. solve/combo/weak = 0으로 두어 gained == dailyXp가 되게 한다. */
  function award(tx: unknown, now: Date) {
    return (
      service as unknown as {
        awardForSubmit(
          tx: unknown,
          userId: string,
          correctCount: number,
          correctFlags: boolean[],
          now: Date,
          perCorrectXp: number,
          weakCorrectCount: number,
          examSessionId: string,
        ): Promise<{
          xp: number;
          gained: number;
          breakdown: { dailyXp: number };
        }>;
      }
    ).awardForSubmit(tx, 'u1', 0, [], now, XP_RULES.CORRECT, 0, 'sess-1');
  }

  it('상수 sanity — DAILY_CHALLENGE는 50 고정', () => {
    expect(XP_RULES.DAILY_CHALLENGE).toBe(50);
  });

  it('Case 1: 당일 첫 제출(st.counted=true)이면 dailyXp=50 지급', async () => {
    const now = new Date(2026, 6, 11, 10, 0, 0);
    // lastActiveDate=null → 첫 학습 → counted=true. streak는 1로 전이돼 마일스톤 0(오염 없음).
    const user = {
      xp: 100,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      xpBoostUntil: null,
    };
    const { tx, update, xpHistoryCreate } = makeTx(user);

    const reward = await award(tx, now);

    expect(reward.breakdown.dailyXp).toBe(50);
    expect(reward.gained).toBe(50); // solve/combo/weak/streak 모두 0 → 데일리만 남음
    expect(reward.xp).toBe(150); // 100 + 50

    // 저장된 xp도 150, 그리고 첫 학습이라 lastActiveDate가 now로 갱신돼야 한다.
    const saved = update.mock.calls[0][0].data;
    expect(saved.xp).toBe(150);
    expect(saved.lastActiveDate).toBe(now);

    // 원장 1행: 이번 이벤트 +50, 사유 SESSION_SUBMIT, 잔액 150, 출처 세션 기록.
    expect(xpHistoryCreate).toHaveBeenCalledTimes(1);
    const ledger = xpHistoryCreate.mock.calls[0][0].data;
    expect(ledger.amount).toBe(50);
    expect(ledger.reason).toBe('SESSION_SUBMIT');
    expect(ledger.balanceAfter).toBe(150);
    expect(ledger.examSessionId).toBe('sess-1');
  });

  it('Case 2: 같은 날 두 번째 제출(st.counted=false)이면 dailyXp=0', async () => {
    const now = new Date(2026, 6, 11, 10, 0, 0);
    // lastActiveDate가 오늘(같은 달력일) → diff=0 → counted=false → 데일리 미지급, 스트릭 유지.
    const user = {
      xp: 100,
      currentStreak: 3,
      longestStreak: 5,
      lastActiveDate: new Date(2026, 6, 11, 8, 0, 0),
      xpBoostUntil: null,
    };
    const { tx, update, xpHistoryCreate } = makeTx(user);

    const reward = await award(tx, now);

    expect(reward.breakdown.dailyXp).toBe(0);
    expect(reward.gained).toBe(0);
    expect(reward.xp).toBe(100); // 변화 없음

    // counted=false면 lastActiveDate 키 자체가 update data에서 빠져야 한다(스프레드 생략).
    const saved = update.mock.calls[0][0].data;
    expect(saved.xp).toBe(100);
    expect('lastActiveDate' in saved).toBe(false);

    // 순증감 0이면 원장 행을 남기지 않는다(노이즈 방지).
    expect(xpHistoryCreate).not.toHaveBeenCalled();
  });
});

/**
 * 복습 전이 이력(user_question_review_transitions) 기록 — 약점 진단(#37)의 "복습 실패율" 원천.
 *
 * 상태 테이블은 현재 값만 들고 있어 X→X("복습에서 또 틀림")를 셀 수 없었다. 이 원장이
 * 비거나 어긋나면 신호 자체가 사라지므로, 정상 경로와 P2002 경합 복구 경로 양쪽에서
 * "실제로 커밋된 전이"가 그대로 적히는지 고정한다.
 */
describe('ExamSessionsService.applyReviewTransitions — 전이 이력 기록', () => {
  let service: ExamSessionsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      // tx를 인자로 받는 private 메서드라 PrismaService 자체는 쓰지 않는다.
      providers: [
        ExamSessionsService,
        { provide: PrismaService, useValue: {} },
        { provide: GeminiLlmService, useValue: {} },
      ],
    }).compile();
    service = module.get(ExamSessionsService);
  });

  type PrevRow = { questionId: string; status: string; consecutiveCorrect: number };

  /**
   * 최소 tx 스텁. prevRows = findMany가 돌려줄 기존 상태들.
   * upsertImpl로 경합(P2002)을 흉내내고, refetched는 그때 재조회될 상대의 행이다.
   */
  function makeTx(
    prevRows: PrevRow[],
    opts: {
      upsertImpl?: () => Promise<unknown>;
      refetched?: { status: string; consecutiveCorrect: number } | null;
    } = {},
  ) {
    const upsert = jest.fn(opts.upsertImpl ?? (() => Promise.resolve({})));
    const findUnique = jest.fn().mockResolvedValue(opts.refetched ?? null);
    const update = jest.fn().mockResolvedValue({});
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      userQuestionReviewState: {
        findMany: jest.fn().mockResolvedValue(prevRows),
        upsert,
        findUnique,
        update,
      },
      userQuestionReviewTransition: { createMany },
    };
    return { tx, upsert, findUnique, update, createMany };
  }

  function apply(tx: unknown, graded: { id: string; correct: boolean }[], now: Date) {
    return (
      service as unknown as {
        applyReviewTransitions(
          tx: unknown,
          userId: string,
          graded: { id: string; correct: boolean }[],
          now: Date,
        ): Promise<void>;
      }
    ).applyReviewTransitions(tx, 'u1', graded, now);
  }

  const NOW = new Date(2026, 7, 5, 9, 0, 0);

  it('X 상태에서 또 틀리면 X→X 전이를 원장에 남긴다 (복습 실패율의 분자)', async () => {
    const { tx, createMany } = makeTx([{ questionId: 'q1', status: 'X', consecutiveCorrect: 0 }]);

    await apply(tx, [{ id: 'q1', correct: false }], NOW);

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toEqual([
      {
        userId: 'u1',
        questionId: 'q1',
        fromStatus: 'X',
        toStatus: 'X',
        correct: false,
        occurredAt: NOW,
      },
    ]);
  });

  it('기존 상태가 없으면 fromStatus는 null (첫 응시)', async () => {
    const { tx, createMany } = makeTx([]);

    await apply(tx, [{ id: 'q1', correct: true }], NOW);

    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'O', correct: true }),
    ]);
  });

  it('X에서 맞히면 X→TRIANGLE — 같은 분모에 들어가되 실패는 아니다', async () => {
    const { tx, createMany } = makeTx([{ questionId: 'q1', status: 'X', consecutiveCorrect: 0 }]);

    await apply(tx, [{ id: 'q1', correct: true }], NOW);

    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ fromStatus: 'X', toStatus: 'TRIANGLE', correct: true }),
    ]);
  });

  it('여러 문항을 createMany 한 번으로 묶는다 (N+1 금지)', async () => {
    const { tx, createMany } = makeTx([
      { questionId: 'q1', status: 'X', consecutiveCorrect: 0 },
      { questionId: 'q2', status: 'TRIANGLE', consecutiveCorrect: 1 },
    ]);

    await apply(
      tx,
      [
        { id: 'q1', correct: false },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true },
      ],
      NOW,
    );

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(3);
  });

  it('채점 대상이 없으면 원장에 손대지 않는다', async () => {
    const { tx, createMany } = makeTx([]);
    await apply(tx, [], NOW);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('P2002 경합 복구 경로에서도 기록이 빠지지 않고, 재조회한 상태 기준으로 적힌다', async () => {
    // 이 트랜잭션이 읽었을 땐 기록이 없었지만(=fromStatus null로 계산), 경합 상대가 먼저
    // 행을 만들어 X로 만들어 놨다. 원장에는 실제로 일어난 X→X가 적혀야 한다 —
    // 처음 계산한 null→X를 적으면 복습 실패율의 분모·분자가 둘 다 어긋난다.
    const conflict = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { tx, update, createMany } = makeTx([], {
      upsertImpl: () => Promise.reject(conflict),
      refetched: { status: 'X', consecutiveCorrect: 0 },
    });

    await apply(tx, [{ id: 'q1', correct: false }], NOW);

    // 복구 경로를 실제로 탔는지(= upsert 실패 후 update) 확인.
    expect(update).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ fromStatus: 'X', toStatus: 'X', correct: false }),
    ]);
  });

  it('P2002 외의 오류는 삼키지 않고 그대로 던진다', async () => {
    const { tx, createMany } = makeTx([], {
      upsertImpl: () => Promise.reject(new Error('boom')),
    });

    await expect(apply(tx, [{ id: 'q1', correct: false }], NOW)).rejects.toThrow('boom');
    expect(createMany).not.toHaveBeenCalled();
  });
});
