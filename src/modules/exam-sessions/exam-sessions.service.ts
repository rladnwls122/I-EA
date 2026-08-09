import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { QuestionKind } from '@/common/constants/question';
import { rollBoxTier, type BoxTier, SOLVE_MILESTONE_THRESHOLD, SOLVE_MILESTONE_COINS } from '@/common/constants/shop';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import {
  XP_RULES,
  levelForXp,
  computeStreak,
  streakMilestoneXp,
  comboBonusXp,
  isBoostActive,
  boostExpiry,
  weakSubjectIds,
  BOOST_MULTIPLIER,
  XP_REASON,
  XpReason,
  satisfiedMilestoneKeys,
} from '@/common/constants/xp';
import { RubricCriterion } from '@/common/constants/rubric';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { SelfGradeDto } from './dto/self-grade.dto';
import {
  grade,
  isSelfGradable,
  maskSnapshot,
  QuestionSnapshot,
  SnapshotPassage,
} from './grading.util';
import { gradeByRubric, readRubric, RubricGrading } from './rubric-grading.util';
import { PMNode } from '@/common/prosemirror/prosemirror.util';
import { transitionReviewState } from './review-state.util';
import { buildSessionAxisReport, SessionAxisReport } from './session-report.util';
import { KEYWORD_TAG_CATEGORY } from '@/common/constants/tag';

// Json 컬럼 쓰기용 국소 캐스팅(생성 클라이언트가 InputJsonValue를 표면화하지 않음).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

@Injectable()
export class ExamSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiLlm: GeminiLlmService,
  ) {}

  /**
   * 필터 조건으로 PUBLISHED 문제를 뽑아 세션을 조립한다.
   * 세션 시작 시점의 문항을 exam_session_questions.snapshot에 통째로 보존해,
   * 원본 문제가 이후 수정/보관돼도 채점 근거가 흔들리지 않게 한다.
   */
  async create(userId: string, dto: CreateSessionDto) {
    // 필터 모드에서만 소분류가 필요하다(DTO의 @ValidateIf가 강제).
    // 플레이리스트 모드는 문제집(Pick & Mix)이 여러 소분류를 섞으므로 subjectId를 받지 않는다.
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
        select: { id: true },
      });
      if (!subject) throw new NotFoundException('소분류를 찾을 수 없습니다.');
    }

    // 두 모드: (1) 플레이리스트 — 지정 문항, (2) 필터 — 조건 랜덤 추출.
    let picked: string[];
    if (dto.questionIds?.length) {
      // 지정 문항 중 PUBLISHED만, 지정 순서를 보존해 세트를 구성한다.
      // 과목은 강제하지 않는다 — 문제집은 교차 과목을 허용한다.
      const found = await this.prisma.question.findMany({
        where: { id: { in: dto.questionIds }, status: 'PUBLISHED' },
        select: { id: true },
      });
      const ok = new Set(found.map((q) => q.id));
      // 일부만 유효하면 조용히 버리지 않고 거부한다.
      // (과거에는 걸러진 문항 없이 짧은 시험이 만들어져 사용자가 알아챌 수 없었다.)
      const missing = [...new Set(dto.questionIds)].filter((id) => !ok.has(id));
      if (missing.length) {
        throw new BadRequestException(
          `플레이리스트에 발행되지 않았거나 존재하지 않는 문항이 있습니다: ${missing.join(', ')}`,
        );
      }
      picked = dto.questionIds.filter((id) => ok.has(id));
    } else {
      if (!dto.questionCount) {
        throw new BadRequestException('questionCount 또는 questionIds 중 하나가 필요합니다.');
      }
      // 하위요소 필터 — relationMode="prisma"라 DB FK가 없으므로 소속 과목을 앱단에서 검증한다
      // (schema의 subject_details 주석 참조). 요청 subjectId 소속이 아니면 조합 자체가 모순이라
      // "조건에 맞는 문제가 없습니다"로 흘리지 않고 명시적으로 거부한다.
      if (dto.filter?.subjectDetailId) {
        const detail = await this.prisma.subjectDetail.findUnique({
          where: { id: dto.filter.subjectDetailId },
          select: { subjectId: true },
        });
        if (!detail) throw new NotFoundException('하위요소를 찾을 수 없습니다.');
        if (detail.subjectId !== dto.subjectId) {
          throw new BadRequestException('하위요소가 요청한 소분류(subjectId)에 속하지 않습니다.');
        }
      }
      // 후보 ID만 가볍게 조회한 뒤 앱에서 셔플·표본추출(간단·MySQL 무관).
      const candidates = await this.prisma.question.findMany({
        where: this.buildQuestionWhere(dto),
        select: { id: true },
        take: 1000,
      });
      if (candidates.length === 0) {
        throw new BadRequestException('조건에 맞는 문제가 없습니다. 필터를 완화하세요.');
      }
      picked = this.sample(candidates.map((c) => c.id), dto.questionCount);
    }

    const full = await this.prisma.question.findMany({
      where: { id: { in: picked } },
      select: {
        id: true,
        questionType: true,
        stem: true,
        choices: true,
        explanation: true,
        correctAnswerText: true,
        // 서술형 채점기준표 — 자기채점이 기준별 부분점수를 내려면 스냅샷에 있어야 한다.
        rubric: true,
        points: true,
        difficulty: true,
        // 결과 화면 정답률 배지용 — 조립 시점 값을 스냅샷에 고정한다.
        totalSolvedCount: true,
        correctSolvedCount: true,
        // 연결 지문 — 있으면 본문을 스냅샷에 통째로 복사(풀이 화면 표시용).
        // setId가 있으면 이 문항은 **함께 읽어야 하는 지문 묶음**의 일부다(#43).
        passage: { select: { content: true, setId: true, setOrder: true, label: true } },
      },
    });
    // picked 순서를 유지해 displayOrder를 안정적으로 부여한다.
    const byId = new Map(full.map((q) => [q.id, q]));

    // 세트 지문 일괄 조회. 문항이 무는 건 근거 지문 하나지만 (가)(나)·토익 double은
    // 나머지 지문 없이 풀 수 없어서, 스냅샷에 세트 전체를 싣는다.
    // 문항 수만큼 쿼리하지 않도록 등장한 setId를 모아 한 번에 가져온다.
    const setIds = [...new Set(full.map((q) => q.passage?.setId).filter((s): s is string => !!s))];
    const passagesBySet = new Map<string, SnapshotPassage[]>();
    if (setIds.length) {
      const members = await this.prisma.passage.findMany({
        where: { setId: { in: setIds } },
        select: { setId: true, setOrder: true, label: true, content: true },
        orderBy: { setOrder: 'asc' },
      });
      for (const m of members) {
        if (!m.setId) continue;
        const list = passagesBySet.get(m.setId) ?? [];
        list.push({ content: m.content as PMNode, ...(m.label ? { label: m.label } : {}) });
        passagesBySet.set(m.setId, list);
      }
    }

    const session = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.examSession.create({
        data: {
          userId,
          subjectId: dto.subjectId ?? null,
          workbookId: dto.workbookId ?? null,
          isReview: dto.isReview ?? false,
          filterCriteria: (dto.questionIds?.length
            ? { mode: 'playlist', questionIds: picked, workbookId: dto.workbookId ?? null }
            : { mode: 'filter', questionCount: dto.questionCount, ...(dto.filter ?? {}) }) as JsonWritable,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.examSessionQuestion.createMany({
        data: picked
          .map((qid, idx) => {
            const q = byId.get(qid);
            if (!q) return null;
            const snapshot: QuestionSnapshot = {
              questionType: q.questionType as QuestionKind,
              stem: q.stem as JsonWritable,
              choices: (q.choices ?? undefined) as JsonWritable,
              explanation: (q.explanation ?? undefined) as JsonWritable,
              correctAnswerText: q.correctAnswerText,
              // 서술형 채점기준표. 세션 시작 뒤 출제자가 기준을 고쳐도 이미 응시한 사람의
              // 채점 근거는 그대로여야 하므로 다른 필드와 같이 통째로 복사해 둔다.
              rubric: (q.rubric ?? undefined) as JsonWritable,
              points: Number(q.points),
              difficulty: q.difficulty,
              totalSolvedCount: q.totalSolvedCount,
              correctSolvedCount: q.correctSolvedCount,
              // 세트면 묶음 전체를, 아니면 단일 지문 하나를 배열로 싣는다.
              // 구형 단수 `passage`는 새로 쓰지 않는다 — 읽기만 하위호환(snapshotPassages).
              ...(q.passage
                ? {
                    passages: (q.passage.setId && passagesBySet.get(q.passage.setId)) || [
                      { content: q.passage.content as PMNode },
                    ],
                  }
                : {}),
            };
            return {
              examSessionId: created.id,
              questionId: qid,
              displayOrder: idx + 1,
              snapshot: snapshot as JsonWritable,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
      });

      return created;
    });

    return { id: session.id, questionCount: picked.length, status: 'IN_PROGRESS' };
  }

  /**
   * 세션 응시 화면 데이터. 진행 중이면 정답/해설을 마스킹해서 내려준다.
   * 제출 완료 세션은 정답·해설·채점 결과를 그대로 노출한다.
   */
  async getById(id: string, userId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true } },
        sessionQuestions: {
          orderBy: { displayOrder: 'asc' },
          include: { answer: true },
        },
      },
    });
    if (!session) throw new NotFoundException('세션을 찾을 수 없습니다.');
    if (session.userId !== userId) throw new ForbiddenException('본인 세션만 조회할 수 있습니다.');

    const inProgress = session.status === 'IN_PROGRESS';

    // 제출 후 결과 화면용 — 축별(난이도·키워드·하위요소) 득점률 리포트(벤치마킹: 산타·매쓰플랫).
    // 축 메타(하위요소·키워드)는 스냅샷에 없어 실문항을 조인한다 — 삭제된 문항은 메타 없이
    // 난이도 축(스냅샷 출처)에만 잡힌다(buildSessionAxisReport가 처리).
    let axisReport: SessionAxisReport | null = null;
    if (!inProgress && session.sessionQuestions.length > 0) {
      const metaRows = await this.prisma.question.findMany({
        where: { id: { in: session.sessionQuestions.map((sq) => sq.questionId) } },
        select: {
          id: true,
          detail: { select: { id: true, name: true } },
          questionTags: {
            where: { tag: { category: KEYWORD_TAG_CATEGORY } },
            select: { tag: { select: { id: true, name: true } } },
          },
        },
      });
      const metaByQuestion = new Map(
        metaRows.map((row) => [
          row.id,
          {
            detail: row.detail,
            keywords: row.questionTags.map((qt: { tag: { id: string; name: string } }) => qt.tag),
          },
        ]),
      );
      axisReport = buildSessionAxisReport(
        session.sessionQuestions.map((sq) => ({
          questionId: sq.questionId,
          difficulty: (sq.snapshot as unknown as QuestionSnapshot).difficulty,
          isCorrect: sq.answer?.isCorrect ?? null,
        })),
        metaByQuestion,
      );
    }

    // 제출 후 결과 화면용 — 문항별 복습 상태(O/세모/X/마스터)를 한 번의 조회로 배치 로드(N+1 금지).
    // 진행 중에는 채점 전이라 의미가 없으므로 조회하지 않는다.
    const reviewStateByQuestion = new Map<
      string,
      { status: string; consecutiveCorrect: number; nextReviewAt: Date | null }
    >();
    if (!inProgress && session.sessionQuestions.length > 0) {
      const states = await this.prisma.userQuestionReviewState.findMany({
        where: { userId, questionId: { in: session.sessionQuestions.map((sq) => sq.questionId) } },
        select: { questionId: true, status: true, consecutiveCorrect: true, nextReviewAt: true },
      });
      for (const st of states) {
        reviewStateByQuestion.set(st.questionId, {
          status: st.status,
          consecutiveCorrect: st.consecutiveCorrect,
          nextReviewAt: st.nextReviewAt,
        });
      }
    }

    return {
      id: session.id,
      subject: session.subject,
      // 결과 화면 추천에서 방금 푼 문제집 자체를 제외하는 데 쓴다(문제집 응시가 아니면 null).
      workbookId: session.workbookId,
      // 복습(오답노트 출처) 세션 여부 — 결과 화면에서 통계 미반영(#19) 안내 등에 쓴다.
      isReview: session.isReview,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      durationSec: session.durationSec,
      // 제출 후에만 — 진행 중에는 채점 전이라 null(정오 힌트가 되기도 한다).
      axisReport,
      questions: session.sessionQuestions.map((sq) => {
        const snapshot = sq.snapshot as unknown as QuestionSnapshot;
        return {
          sessionQuestionId: sq.id,
          questionId: sq.questionId,
          displayOrder: sq.displayOrder,
          // 진행 중에는 정답 은닉, 채점 완료 후에는 원본 스냅샷 공개.
          snapshot: inProgress ? maskSnapshot(snapshot) : snapshot,
          // 제출 후에만 문항별 복습 상태 노출(기록 없으면 null).
          ...(inProgress ? {} : { reviewState: reviewStateByQuestion.get(sq.questionId) ?? null }),
          answer: sq.answer
            ? {
                selectedChoiceIds: sq.answer.selectedChoiceIds,
                answerText: sq.answer.answerText,
                annotations: sq.answer.annotations,
                isCorrect: inProgress ? undefined : sq.answer.isCorrect,
                timeSpentSec: sq.answer.timeSpentSec,
              }
            : null,
        };
      }),
    };
  }

  /**
   * 개별 문항 답안 제출/수정(OMR). 제출 즉시 스냅샷 기준으로 채점해 저장한다.
   * exam_session_answers는 문항당 1건(UNIQUE) → upsert.
   */
  async submitAnswer(sessionQuestionId: string, userId: string, dto: SubmitAnswerDto) {
    const sq = await this.prisma.examSessionQuestion.findUnique({
      where: { id: sessionQuestionId },
      select: { id: true, snapshot: true, examSession: { select: { userId: true, status: true } } },
    });
    if (!sq) throw new NotFoundException('세션 문항을 찾을 수 없습니다.');
    if (sq.examSession.userId !== userId) throw new ForbiddenException('본인 세션만 응시할 수 있습니다.');
    if (sq.examSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('이미 제출된 세션입니다.');
    }

    const snapshot = sq.snapshot as unknown as QuestionSnapshot;
    const isCorrect = grade(snapshot, {
      selectedChoiceIds: dto.selectedChoiceIds,
      answerText: dto.answerText,
    });

    await this.prisma.examSessionAnswer.upsert({
      where: { examSessionQuestionId: sessionQuestionId },
      create: {
        examSessionQuestionId: sessionQuestionId,
        selectedChoiceIds: (dto.selectedChoiceIds ?? undefined) as JsonWritable,
        answerText: dto.answerText ?? null,
        annotations: (dto.annotations ?? undefined) as JsonWritable,
        isCorrect,
        timeSpentSec: dto.timeSpentSec ?? null,
        answeredAt: new Date(),
      },
      update: {
        selectedChoiceIds: (dto.selectedChoiceIds ?? undefined) as JsonWritable,
        answerText: dto.answerText ?? null,
        annotations: (dto.annotations ?? undefined) as JsonWritable,
        isCorrect,
        timeSpentSec: dto.timeSpentSec ?? null,
        answeredAt: new Date(),
      },
    });

    // 진행 중에는 정오 결과를 숨기고, 저장 여부만 반환한다.
    return { sessionQuestionId, saved: true };
  }

  /**
   * 세션 최종 제출. 상태를 SUBMITTED로 바꾸고 채점 결과를 집계한 뒤,
   * 문항별 풀이 카운터 캐시(total/correct_solved_count)를 갱신한다.
   */
  async submit(id: string, userId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id },
      include: {
        sessionQuestions: {
          include: {
            answer: {
              select: { isCorrect: true, selectedChoiceIds: true, timeSpentSec: true },
            },
            // 취약 유형 보너스 판정을 위해 각 문항의 세부과목이 필요하다.
            question: { select: { subjectId: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('세션을 찾을 수 없습니다.');
    if (session.userId !== userId) throw new ForbiddenException('본인 세션만 제출할 수 있습니다.');
    if (session.status !== 'IN_PROGRESS') throw new BadRequestException('이미 제출된 세션입니다.');

    // 취약 유형(하위 20% 정답률 세부과목) — 이번 세션 제외, 과거 이력 기준.
    const weakSet = await this.computeWeakSubjectIds(userId, id);

    const total = session.sessionQuestions.length;
    let correct = 0;
    let answered = 0;
    let weakCorrect = 0; // 취약 유형을 맞힌 정답 수 → WEAK_TYPE 보너스 대상
    const gradedQuestionIds: { id: string; correct: boolean }[] = [];
    // 콤보(세션 내 연속 정답) 계산용 — 문항 순서대로 정답 여부.
    const correctFlags: boolean[] = [];
    // 평균 풀이시간 캐시: 채점 여부와 무관하게 시간이 기록된 답안만 집계한다.
    const timed: { id: string; sec: number }[] = [];
    // 선지별 오답 분포: 선택된 선지 id마다 +1.
    const choicePicks: { questionId: string; choiceId: string }[] = [];

    for (const sq of session.sessionQuestions) {
      const isCorrect = sq.answer?.isCorrect;
      if (sq.answer) answered += 1;
      if (isCorrect === true) correct += 1;
      correctFlags.push(isCorrect === true);
      if (isCorrect === true && sq.question?.subjectId && weakSet.has(sq.question.subjectId)) {
        weakCorrect += 1;
      }
      // 자동 채점된(정오가 확정된) 문항만 통계 캐시에 반영.
      if (isCorrect === true || isCorrect === false) {
        gradedQuestionIds.push({ id: sq.questionId, correct: isCorrect });
      }

      const sec = sq.answer?.timeSpentSec;
      if (typeof sec === 'number' && sec >= 0) timed.push({ id: sq.questionId, sec });

      for (const choiceId of this.readChoiceIds(sq.answer?.selectedChoiceIds)) {
        choicePicks.push({ questionId: sq.questionId, choiceId });
      }
    }

    const now = new Date();
    const durationSec = session.startedAt
      ? Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 1000))
      : null;
    const scorePercent = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;

    const reward = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.examSession.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: now, durationSec },
      });

      // 문제집 응시면 평균 점수 캐시를 누적한다(avg = scoreSumPercent / attemptCount).
      // 목록 카드마다 세션을 집계하면 N+1이 되므로 여기서 미리 더한다.
      if (session.workbookId) {
        await tx.workbook.update({
          where: { id: session.workbookId },
          data: {
            attemptCount: { increment: 1 },
            scoreSumPercent: { increment: scorePercent },
          },
        });
      }

      // 문항 전역 통계 캐시 갱신 — 복습(오답노트 출처) 세션의 2차 채점은 전부 건너뛴다(#19).
      // 이미 1차 응시에서 센 풀이를 다시 세면 정답률·평균 풀이시간·선지 분포가 전부 오염된다.
      if (!session.isReview) {
        // 문항별 정답률 캐시 갱신(같은 문항이 여러 번 나오는 경우는 없다고 가정).
        // 증가 후 값으로 누적 10솔브 저자 보너스를 함께 판정한다.
        for (const g of gradedQuestionIds) {
          const updatedQuestion = await tx.question.update({
            where: { id: g.id },
            data: {
              totalSolvedCount: { increment: 1 },
              ...(g.correct ? { correctSolvedCount: { increment: 1 } } : {}),
            },
            select: { id: true, creatorId: true, totalSolvedCount: true, solveBonusAwarded: true },
          });
          await this.maybeAwardSolveMilestone(tx, updatedQuestion, now);
        }

        // 평균 풀이시간 캐시(avg = totalTimeSpentSec / timedSolvedCount).
        for (const t of timed) {
          await tx.question.update({
            where: { id: t.id },
            data: {
              totalTimeSpentSec: { increment: t.sec },
              timedSolvedCount: { increment: 1 },
            },
          });
        }

        // 선지별 선택 분포. 해당 (문항,선지) 행이 없으면 만들고 있으면 +1.
        for (const p of choicePicks) {
          await tx.questionChoiceStat.upsert({
            where: { questionId_choiceId: { questionId: p.questionId, choiceId: p.choiceId } },
            create: { questionId: p.questionId, choiceId: p.choiceId, count: 1 },
            update: { count: { increment: 1 } },
          });
        }
      }

      // 복습 상태(O/세모/X/마스터) 전이 — 자동채점(정오 확정)된 문항 전부.
      // isReview 여부와 무관하게 항상 수행한다(복습 세션이야말로 상태 전이의 핵심 입력).
      await this.applyReviewTransitions(tx, userId, gradedQuestionIds, now);

      // XP 적립: 정답 기본점 + 콤보 + 스트릭, 부스터 반영. 서술형(미확정)은 selfGrade에서.
      // 복습(오답노트 출처) 세션이면 정답 기본점을 REVIEW_CORRECT(+15)로 올린다.
      const perCorrectXp = session.isReview ? XP_RULES.REVIEW_CORRECT : XP_RULES.CORRECT;
      const reward = await this.awardForSubmit(tx, userId, correct, correctFlags, now, perCorrectXp, weakCorrect, id);
      // 상자 드롭: XP 적립과 별개로, 제출 자체에 대한 보상. 미개봉 상태로 지급.
      const box = await this.maybeDropBox(tx, userId, scorePercent, id);
      return { reward, box };
    }, {
      // 제출 트랜잭션은 문항 수만큼 순차 DB 왕복(정답률·풀이시간·선지분포·보상)이
      // 누적된다. 원격 DB(TiDB)에선 Prisma 기본 5초 상호작용 타임아웃을 넘겨
      // P2028(Transaction already closed) → 500 "제출 실패"가 나므로 여유를 준다.
      timeout: 20000,
      maxWait: 10000,
    });

    return {
      id,
      status: 'SUBMITTED',
      total,
      answered,
      correct,
      scorePercent,
      durationSec,
      // 이번 제출로 적립된 XP와 갱신된 xp/레벨. 적립 없으면 null.
      reward: reward.reward,
      // 이번 제출로 드롭된 미개봉 상자. 미드롭이면 null.
      box: reward.box,
    };
  }

  /**
   * 서술형(자기채점 대상) 문항의 정오를 응시자가 직접 확정한다.
   * 세션 제출(SUBMITTED) 이후 결과 화면에서 호출. 최초 확정 시 문항 정답률 캐시도 갱신한다.
   *
   * 스냅샷에 채점기준표가 있으면 정오를 직접 받지 않고 **충족한 기준의 배점 합**으로 계산한다
   * (#43 gap 8). 부분점수 자체는 답안에 남기고, 기존 파이프라인(정답률 캐시·복습 전이·XP)이
   * 요구하는 `isCorrect` 불리언은 rubric-grading.util의 기준선으로 접어서 넘긴다.
   */
  async selfGrade(sessionQuestionId: string, userId: string, dto: SelfGradeDto) {
    const sq = await this.prisma.examSessionQuestion.findUnique({
      where: { id: sessionQuestionId },
      select: {
        id: true,
        questionId: true,
        snapshot: true,
        answer: { select: { id: true, isCorrect: true, annotations: true } },
        examSession: { select: { id: true, userId: true, status: true, isReview: true } },
      },
    });
    if (!sq) throw new NotFoundException('세션 문항을 찾을 수 없습니다.');
    if (sq.examSession.userId !== userId) throw new ForbiddenException('본인 세션만 채점할 수 있습니다.');
    if (sq.examSession.status !== 'SUBMITTED') {
      throw new BadRequestException('제출된 세션에서만 자기채점할 수 있습니다.');
    }
    if (!sq.answer) throw new BadRequestException('제출된 답안이 없습니다.');

    const snapshot = sq.snapshot as unknown as QuestionSnapshot;
    if (!isSelfGradable(snapshot)) {
      throw new BadRequestException('자기채점 대상(서술형) 문항이 아닙니다.');
    }

    // 형태가 깨진 rubric은 통째로 null이 되어 기존 정오 2지선다 경로로 되돌아간다(readRubric).
    const rubric = readRubric(snapshot.rubric);
    const { isCorrect, rubricGrading } = this.resolveSelfGrade(rubric, dto);

    const answerId = sq.answer.id;
    const prev = sq.answer.isCorrect; // null(미채점) | boolean(재채점)

    // XP 델타: 정답이면 +기본점, 직전이 정답이었으면 -기본점.
    //   복습(오답노트 출처) 세션이면 기본점은 REVIEW_CORRECT(+15), 아니면 CORRECT(+10).
    //   null→정답:+p, null→오답:0, 오답→정답:+p, 정답→오답:-p, 변화없음:0.
    const perCorrectXp = sq.examSession.isReview
      ? XP_RULES.REVIEW_CORRECT
      : XP_RULES.CORRECT;
    const xpDelta =
      (isCorrect ? perCorrectXp : 0) - (prev === true ? perCorrectXp : 0);

    const reward = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.examSessionAnswer.update({
        where: { id: answerId },
        data: {
          isCorrect,
          // 부분점수는 채점 근거 전체(annotations.rubricGrading)와 집계용 숫자(두 컬럼)를
          // **한 곳에서 함께** 만들어 같은 update에 싣는다 — 둘이 어긋나면 리포트가 조용히 틀린다.
          // rubric이 없는 채점은 아무것도 쓰지 않아 두 컬럼이 null로 남는다(대상 선별의 근거).
          ...(rubricGrading
            ? this.rubricGradingWrite(sq.answer?.annotations, rubricGrading)
            : {}),
        },
      });

      // 정답률 캐시 델타: 최초 확정이면 total+1(+정답 시 correct+1), 재채점이면 correct만 보정.
      // 최초 확정(=totalSolvedCount 증가) 시에만 증가 후 값으로 누적 10솔브 저자 보너스를 판정한다.
      // 복습(오답노트 출처) 세션의 2차 채점은 통계에 반영하지 않는다(#19).
      if (sq.examSession.isReview) {
        // 통계 미반영 — 아래 else-if 체인을 건너뛴다.
      } else if (prev === null || prev === undefined) {
        const updatedQuestion = await tx.question.update({
          where: { id: sq.questionId },
          data: {
            totalSolvedCount: { increment: 1 },
            ...(isCorrect ? { correctSolvedCount: { increment: 1 } } : {}),
          },
          select: { id: true, creatorId: true, totalSolvedCount: true, solveBonusAwarded: true },
        });
        await this.maybeAwardSolveMilestone(tx, updatedQuestion, new Date());
      } else if (prev !== isCorrect) {
        await tx.question.update({
          where: { id: sq.questionId },
          data: { correctSolvedCount: { increment: isCorrect ? 1 : -1 } },
        });
      }

      // 복습 상태 전이 — 최초 확정(prev === null)에만 적용한다(isReview 여부와는 무관).
      // 재채점(같은 값 재전송·정오 번복)은 실제 재도전이 아니라 채점 '정정'이므로 전이 입력으로
      // 세지 않는다 — 같은 정답을 반복 전송하는 것만으로 연속 정답이 쌓여 사다리를 건너뛰고
      // MASTERED로 졸업하는 오염을 막기 위함이다.
      if (prev === null || prev === undefined) {
        await this.applyReviewTransitions(tx, userId, [{ id: sq.questionId, correct: isCorrect }], new Date());
      }

      return xpDelta !== 0
        ? this.awardXp(tx, userId, xpDelta, {
            reason: XP_REASON.SELF_GRADE,
            examSessionId: sq.examSession.id,
          })
        : null;
    });

    return { sessionQuestionId, isCorrect, rubricGrading, reward };
  }

  /**
   * 자기채점 요청을 (정오, 부분점수)로 푼다 — 채점기준표 유무가 요청 형태를 결정한다.
   *
   * 두 입력을 함께 받지 않는 이유: 기준 체크와 사용자가 누른 정오가 어긋날 수 있고, 그러면
   * 답안에 남는 점수와 통계에 반영되는 정오가 서로 다른 근거를 갖게 된다. 근거는 하나여야 한다.
   */
  private resolveSelfGrade(
    rubric: RubricCriterion[] | null,
    dto: SelfGradeDto,
  ): { isCorrect: boolean; rubricGrading: RubricGrading | null } {
    if (!rubric) {
      if (dto.checkedCriterionIds !== undefined) {
        throw new BadRequestException('이 문항에는 채점기준표가 없습니다 — isCorrect로 채점하세요.');
      }
      if (typeof dto.isCorrect !== 'boolean') {
        throw new BadRequestException('isCorrect가 필요합니다.');
      }
      return { isCorrect: dto.isCorrect, rubricGrading: null };
    }

    if (dto.isCorrect !== undefined) {
      throw new BadRequestException(
        '채점기준표가 있는 문항은 checkedCriterionIds로만 채점합니다(정오는 배점 합으로 결정됩니다).',
      );
    }
    if (!Array.isArray(dto.checkedCriterionIds)) {
      throw new BadRequestException('checkedCriterionIds가 필요합니다(빈 배열이면 0점).');
    }

    const result = gradeByRubric(rubric, dto.checkedCriterionIds);
    // 이 문항에 없는 기준 id는 조용히 버리지 않는다 — 클라이언트 버그이거나 조작이고,
    // 무시하면 응시자가 체크한 것과 저장된 점수가 다른 채로 확정된다.
    if (result.unknownIds.length) {
      throw new BadRequestException(
        `이 문항의 채점기준에 없는 id입니다: ${result.unknownIds.join(', ')}`,
      );
    }
    // unknownIds는 위에서 이미 걸렀으므로 답안에 남길 이유가 없다 — 저장 형태에서 뺀다.
    const grading: RubricGrading = {
      checkedIds: result.checkedIds,
      earnedPoints: result.earnedPoints,
      totalPoints: result.totalPoints,
      isCorrect: result.isCorrect,
    };
    return { isCorrect: grading.isCorrect, rubricGrading: grading };
  }

  /**
   * 부분점수 채점 결과를 answers update의 data 조각으로 만든다 — **Json과 컬럼을 함께**.
   *
   * 왜 두 곳에 같은 숫자를 쓰는가: 채점 근거 전체(체크한 기준 id 등)는 Json이 아니면 담을
   * 자리가 없고, 반대로 Json 안에 있는 숫자는 SQL로 집계할 수 없다(MySQL JSON 함수는 TiDB
   * 호환 때문에 쓰지 않는다). 그래서 근거는 Json에, 집계용 숫자는 컬럼에 둔다.
   *
   * 두 값이 갈라지지 않게 하는 방법이 이 함수다: 호출부가 각각 채워 넣을 수 있는 여지를 남기지
   * 않고 **같은 grading 하나에서 세 필드를 동시에 만들어** 한 update에 싣는다.
   * 재채점도 같은 경로를 지나므로 Json과 컬럼이 함께 갱신된다.
   *
   * annotations는 통째로 덮지 않고 병합한다(필기 스트로크를 지우지 않으려고). 기존 값이 평범한
   * 객체가 아니면(배열·스칼라 등 손상 데이터) 병합할 자리가 없으므로 새 객체로 시작한다 —
   * 채점 결과를 못 남기는 것보다 낫다. annotations를 쓰는 다른 경로는 submitAnswer뿐이고
   * 그건 IN_PROGRESS에서만 열린다 — 자기채점(SUBMITTED)과 시점이 겹치지 않는다.
   */
  private rubricGradingWrite(
    existing: unknown,
    grading: RubricGrading,
  ): { annotations: JsonWritable; earnedPoints: number; rubricTotalPoints: number } {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    return {
      annotations: { ...base, rubricGrading: grading } as JsonWritable,
      // Decimal(8,2) 컬럼이지만 Prisma가 number 입력을 받는다. 값은 rubric-grading.util이
      // 이미 소수 2자리로 반올림해 둔 것이라 컬럼 정밀도와 어긋나지 않는다.
      earnedPoints: grading.earnedPoints,
      rubricTotalPoints: grading.totalPoints,
    };
  }

  /**
   * 오답 복습 상태(user_question_review_states) 전이를 채점 트랜잭션 안에서 일괄 반영한다.
   * 기존 상태를 한 번의 findMany로 배치 조회한 뒤(N+1 금지) transitionReviewState(순수 함수)를
   * 적용해 유저×문항당 1행을 upsert한다. 세션 제출·자기채점 양쪽에서 호출된다.
   *
   * 같은 트랜잭션에서 전이 이력(user_question_review_transitions)에도 1행씩 남긴다(#37).
   * 상태 테이블은 **현재 값만** 들고 있어 "복습에서 또 틀렸다"(X→X)를 셀 수 없다 —
   * 지금 X인 문항이 처음 틀린 건지 세 번째 틀린 건지 구분되지 않기 때문이다.
   * 이력은 상태 갱신과 원자적으로 커밋돼야 한다(따로 쓰면 둘이 어긋난 원장이 남는다).
   */
  private async applyReviewTransitions(
    tx: Prisma.TransactionClient,
    userId: string,
    graded: { id: string; correct: boolean }[],
    now: Date,
  ): Promise<void> {
    if (graded.length === 0) return;

    const prevRows = await tx.userQuestionReviewState.findMany({
      where: { userId, questionId: { in: graded.map((g) => g.id) } },
      select: { questionId: true, status: true, consecutiveCorrect: true },
    });
    const prevByQuestion = new Map(prevRows.map((r) => [r.questionId, r]));

    // 이력은 문항마다 왕복하지 않고 모아서 createMany 한 번으로 쓴다(배치 조회와 같은 이유).
    const transitions: {
      userId: string;
      questionId: string;
      fromStatus: string | null;
      toStatus: string;
      correct: boolean;
      occurredAt: Date;
    }[] = [];

    for (const g of graded) {
      const prev = prevByQuestion.get(g.id) ?? null;
      const next = transitionReviewState(prev, g.correct, now);
      // 실제로 커밋된 전이의 from/to를 적는다. 경합 복구 경로에서는 재조회한 값으로 덮인다.
      let fromStatus: string | null = prev?.status ?? null;
      let toStatus: string = next.status;
      try {
        await tx.userQuestionReviewState.upsert({
          where: { userId_questionId: { userId, questionId: g.id } },
          create: { userId, questionId: g.id, ...next },
          update: next,
        });
      } catch (e) {
        // 동시 제출 경합 방어: Prisma upsert는 원자적이지 않아(특히 relationMode="prisma")
        // 두 트랜잭션이 동시에 create 경로를 타면 UNIQUE(user,question) 충돌(P2002)이 난다.
        // 복습 상태 한 건 때문에 제출 전체를 500으로 죽이지 않도록, 경합 상대가 만든 행을
        // 재조회해 그 값을 기준으로 전이를 1회만 다시 적용한다.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const cur = await tx.userQuestionReviewState.findUnique({
            where: { userId_questionId: { userId, questionId: g.id } },
            select: { status: true, consecutiveCorrect: true },
          });
          const retried = transitionReviewState(cur ?? null, g.correct, now);
          await tx.userQuestionReviewState.update({
            where: { userId_questionId: { userId, questionId: g.id } },
            data: retried,
          });
          // 경합 상대가 이미 상태를 바꿔 놓았으므로 처음 계산한 from/to는 사실이 아니다.
          // 원장에는 실제로 일어난 전이(재조회 상태 → 재전이 결과)를 적어야 X→X 집계가 맞는다.
          fromStatus = cur?.status ?? null;
          toStatus = retried.status;
        } else {
          throw e;
        }
      }
      transitions.push({
        userId,
        questionId: g.id,
        fromStatus,
        toStatus,
        correct: g.correct,
        occurredAt: now,
      });
    }

    await tx.userQuestionReviewTransition.createMany({ data: transitions });
  }

  /**
   * 문항이 누적 SOLVE_MILESTONE_THRESHOLD(10)회 풀리면 저자에게 1회성 +20코인.
   * solveBonusAwarded 플래그로 최초 1회만 지급 — 매 풀이마다 재발동하지 않도록 방어.
   * 자기 문제를 자기가 풀어 임계에 도달해도 저자 보상이므로 지급한다(계정당 최초 1회뿐이라 반복 악용은 안 되지만,
   * 자작 문제로 셀프 임계 유도 여지는 있어 보고서에 별도로 남긴다).
   * totalSolvedCount는 호출 전에 이미 증가된 값을 넘겨받는다.
   */
  private async maybeAwardSolveMilestone(
    tx: Prisma.TransactionClient,
    question: { id: string; creatorId: string; totalSolvedCount: number; solveBonusAwarded: boolean },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- coinHistory.createdAt은 DB default(now())를 쓴다. 인터페이스는 플랜과 맞춰 유지.
    _now: Date,
  ): Promise<{ awarded: boolean }> {
    if (question.solveBonusAwarded) return { awarded: false };
    if (question.totalSolvedCount < SOLVE_MILESTONE_THRESHOLD) return { awarded: false };

    const updatedUser = await tx.user.update({
      where: { id: question.creatorId },
      data: { coins: { increment: SOLVE_MILESTONE_COINS } },
      select: { coins: true },
    });

    await tx.coinHistory.create({
      data: {
        userId: question.creatorId,
        amount: SOLVE_MILESTONE_COINS,
        reason: 'SOLVE_MILESTONE',
        referenceId: question.id,
        balanceAfter: updatedUser.coins,
      },
    });

    await tx.question.update({
      where: { id: question.id },
      data: { solveBonusAwarded: true },
    });

    return { awarded: true };
  }

  /**
   * XP를 delta만큼 적립(음수 가능 — 자기채점 하향 시 회수)하고 xp에서 레벨을 다시 계산한다.
   * 채점 트랜잭션 내부에서 호출한다 — 캐시 갱신과 원자적으로 커밋되어야 하기 때문.
   * xp는 0 미만으로 내려가지 않도록 바닥을 친다.
   */
  private async awardXp(
    tx: Prisma.TransactionClient,
    userId: string,
    delta: number,
    ctx: { reason: XpReason; examSessionId?: string | null },
  ): Promise<{ xp: number; level: number; gained: number }> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { xp: true, longestStreak: true },
    });
    const current = user?.xp ?? 0;
    const xp = Math.max(0, current + delta);
    const level = levelForXp(xp);
    await tx.user.update({ where: { id: userId }, data: { xp, level } });
    const gained = xp - current;
    // 원장 기록 + 마일스톤 감지. 자기채점은 스트릭 무관이라 최장 스트릭은 기존값 그대로.
    await this.recordXpEvent(tx, userId, {
      amount: gained,
      reason: ctx.reason,
      balanceAfter: xp,
      longestStreak: user?.longestStreak ?? 0,
      examSessionId: ctx.examSessionId,
    });
    return { xp, level, gained };
  }

  /**
   * XP 원장(xp_history) 1행 기록 + 마일스톤 달성 감지를, 적립 트랜잭션 내부에서 함께 커밋한다.
   *   - 순증감이 0이면 원장 행은 남기지 않는다(변화 없는 이벤트 노이즈 방지).
   *   - 마일스톤은 현재 만족 집합을 createMany(skipDuplicates)로 멱등 삽입 → 신규 달성만 기록.
   */
  private async recordXpEvent(
    tx: Prisma.TransactionClient,
    userId: string,
    params: {
      amount: number;
      reason: XpReason;
      balanceAfter: number;
      longestStreak: number;
      examSessionId?: string | null;
      breakdown?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    if (params.amount !== 0) {
      await tx.xpHistory.create({
        data: {
          userId,
          amount: params.amount,
          reason: params.reason,
          balanceAfter: params.balanceAfter,
          examSessionId: params.examSessionId ?? null,
          breakdown: (params.breakdown ?? undefined) as JsonWritable,
        },
      });
    }
    const keys = satisfiedMilestoneKeys(params.balanceAfter, params.longestStreak);
    if (keys.length > 0) {
      await tx.milestoneAchievement.createMany({
        data: keys.map((milestoneKey) => ({ userId, milestoneKey })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * 사용자의 세부과목별 정답률을 집계해 '취약 유형'(하위 20%) 세부과목 id 집합을 구한다.
   * 이번 세션(excludeSessionId)은 제외해 "이번에 도전하기 전"의 취약점을 기준으로 판정한다.
   * 자동채점/자기채점이 끝난(is_correct NOT NULL) 답안만 집계 대상.
   */
  private async computeWeakSubjectIds(
    userId: string,
    excludeSessionId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<
      { subjectId: string; total: bigint | number; correct: bigint | number }[]
    >`
      SELECT q.subject_id AS subjectId,
             COUNT(*) AS total,
             SUM(a.is_correct = 1) AS correct
      FROM exam_session_answers a
      JOIN exam_session_questions sq ON sq.id = a.exam_session_question_id
      JOIN questions q ON q.id = sq.question_id
      JOIN exam_sessions s ON s.id = sq.exam_session_id
      WHERE s.user_id = ${userId}
        AND a.is_correct IS NOT NULL
        AND s.id <> ${excludeSessionId}
      GROUP BY q.subject_id
    `;
    const stats = rows.map((r) => ({
      subjectId: r.subjectId,
      total: Number(r.total),
      correct: Number(r.correct),
    }));
    return weakSubjectIds(stats);
  }

  /**
   * 세션 제출 시 XP 적립(정답 기본점 + 콤보 + 스트릭 + 데일리)과 스트릭/부스터 상태 갱신을 한 번에.
   *   1) 기본점 = 정답 수 × CORRECT, 콤보 = 세션 내 연속 정답 보너스.
   *   2) 부스터가 유효하면 (기본점+콤보)에 2배 적용(스트릭·데일리 보너스는 제외).
   *   3) 스트릭 전이 후 7/30일 마일스톤이면 보너스 + 다음날 2배 부스터 부여.
   *   4) 그날 첫 제출이면 데일리 챌린지 보너스 +50(하루 1회, 부스터 미적용).
   * 채점 트랜잭션 내부에서 호출되어 캐시 갱신과 원자적으로 커밋된다.
   */
  private async awardForSubmit(
    tx: Prisma.TransactionClient,
    userId: string,
    correctCount: number,
    correctFlags: boolean[],
    now: Date,
    /** 정답 1개당 기본 XP. 일반 세션 CORRECT(10), 복습 세션 REVIEW_CORRECT(15). */
    perCorrectXp: number,
    /** 취약 유형(하위 20% 정답률 과목)을 맞힌 정답 수 → 개당 WEAK_TYPE 보너스. */
    weakCorrectCount: number,
    /** 출처 세션 id — xp_history 추적용. */
    examSessionId: string,
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        xp: true,
        currentStreak: true,
        longestStreak: true,
        lastActiveDate: true,
        xpBoostUntil: true,
      },
    });
    if (!user) return null;

    // 1) 기본점 + 콤보 + 취약유형 보너스 (부스터 적용 대상)
    const solveXp = correctCount * perCorrectXp;
    const comboXp = comboBonusXp(correctFlags);
    const weakXp = weakCorrectCount * XP_RULES.WEAK_TYPE;
    const boostActive = isBoostActive(user.xpBoostUntil, now);
    const grindXp = (solveXp + comboXp + weakXp) * (boostActive ? BOOST_MULTIPLIER : 1);

    // 2) 스트릭 전이 + 마일스톤(부스터 미적용). 보유한 '연속학습 보호권' 수량을 조회해 하루 결석 방어에 사용.
    const shield = await tx.userInventory.findUnique({
      where: { userId_itemKey: { userId, itemKey: 'STREAK_SHIELD' } },
      select: { quantity: true },
    });
    const st = computeStreak(user.lastActiveDate, user.currentStreak, now, shield?.quantity ?? 0);
    const milestone = st.counted ? streakMilestoneXp(st.currentStreak) : { xp: 0, grantBoost: false };

    // 3) 데일리 챌린지 보너스(부스터 미적용) — 그날 첫 채점 제출에만 +50, 하루 1회.
    //    st.counted가 곧 "오늘 첫 학습"이므로(lastActiveDate 기준) 별도 컬럼 없이 하루 1회를 보장한다.
    const dailyXp = st.counted ? XP_RULES.DAILY_CHALLENGE : 0;

    const gained = grindXp + milestone.xp + dailyXp;
    const xp = Math.max(0, user.xp + gained);
    const level = levelForXp(xp);
    const longestStreak = Math.max(user.longestStreak, st.currentStreak);
    // 부스터 만료: 이번에 마일스톤을 새로 밟았으면 갱신, 아니면 기존 유지.
    const xpBoostUntil = milestone.grantBoost ? boostExpiry(now) : user.xpBoostUntil;

    await tx.user.update({
      where: { id: userId },
      data: {
        xp,
        level,
        currentStreak: st.currentStreak,
        longestStreak,
        // 오늘 처음 학습(counted)일 때만 마지막 학습일을 오늘로 갱신.
        ...(st.counted ? { lastActiveDate: now } : {}),
        xpBoostUntil,
      },
    });

    // 보호권으로 스트릭을 방어했으면 인벤토리에서 1개 소모.
    if (st.shieldConsumed) {
      await tx.userInventory.update({
        where: { userId_itemKey: { userId, itemKey: 'STREAK_SHIELD' } },
        data: { quantity: { decrement: 1 } },
      });
    }

    const breakdown = { solveXp, comboXp, weakXp, streakXp: milestone.xp, dailyXp, boostActive };
    // 원장 기록 + 마일스톤 감지(제출 후 xp/최장스트릭 기준).
    await this.recordXpEvent(tx, userId, {
      amount: gained,
      reason: XP_REASON.SESSION_SUBMIT,
      balanceAfter: xp,
      longestStreak,
      examSessionId,
      breakdown,
    });

    return {
      xp,
      level,
      gained,
      breakdown,
      streak: { current: st.currentStreak, longest: longestStreak, extended: st.counted },
      boostGranted: milestone.grantBoost,
    };
  }

  /** 제출 후 상자 드롭 롤. 히트 시 미개봉 LootBox 생성. 코인은 개봉 때 롤. */
  private async maybeDropBox(
    tx: Prisma.TransactionClient,
    userId: string,
    scorePercent: number,
    examSessionId: string,
    rng: () => number = Math.random,
  ): Promise<{ id: string; tier: BoxTier } | null> {
    const tier = rollBoxTier(scorePercent, rng);
    if (!tier) return null;
    const box = await tx.lootBox.create({
      data: { userId, tier, examSessionId },
      select: { id: true, tier: true },
    });
    return { id: box.id, tier: box.tier as BoxTier };
  }

  // --- 헬퍼 -----------------------------------------------------------

  /**
   * exam_session_answers.selected_choice_ids는 Json 컬럼이라 런타임 형태를 보장할 수 없다.
   * 문자열 배열만 통과시키고 나머지(null/객체/숫자)는 빈 배열로 흘린다.
   * 중복 선택은 한 번만 센다(같은 선지를 두 번 담아 분포를 부풀리지 못하도록).
   */
  private readChoiceIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0))];
  }

  private buildQuestionWhere(dto: CreateSessionDto): Prisma.QuestionWhereInput {
    const f = dto.filter ?? {};
    const difficulty =
      f.minDifficulty || f.maxDifficulty
        ? { gte: f.minDifficulty ?? 1, lte: f.maxDifficulty ?? 5 }
        : undefined;

    return {
      status: 'PUBLISHED',
      // 소분류 소속. 필터 모드에서만 호출되며 DTO의 @ValidateIf가 존재를 보장한다.
      subjectId: dto.subjectId!,
      // 하위요소(4단계) 필터 — 소속 검증은 create()가 사전에 수행한다.
      ...(f.subjectDetailId ? { subjectDetailId: f.subjectDetailId } : {}),
      ...(f.questionTypes?.length ? { questionType: { in: f.questionTypes } } : {}),
      /**
       * 서술형만 (#33 잔여 2). 서술형의 정의를 새로 만들지 않고 채점기(`grading.util`)가
       * 쓰는 판정을 그대로 건다 — 주관식 + 단답 정답 없음 + 채점기준표 있음.
       *
       * 세 조건을 다 거는 이유: `rubric`만 보면 단답 정답이 채워진 뒤 남은 죽은 기준까지
       * 딸려 오고(지금은 저장 시 지우지만 과거 데이터가 있다), `correctAnswerText`만 보면
       * 기준표 없는 정오 2지선다 자기채점 문항이 섞여 득점률 축과 모집단이 어긋난다.
       */
      ...(f.rubricOnly
        ? {
            AND: [
              // questionTypes와 함께 오면 **좁히기만** 한다. 위 spread를 덮어써 '주관식'으로
              // 되돌리면 "객관식만"이라는 요청을 조용히 뒤집게 된다 — 모순된 조합은
              // 새 예외가 아니라 빈 결과(문항 부족)로 답한다.
              { questionType: '주관식' },
              { rubric: { not: Prisma.DbNull } },
              { OR: [{ correctAnswerText: null }, { correctAnswerText: '' }] },
            ],
          }
        : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(f.tagIds?.length ? { questionTags: { some: { tagId: { in: f.tagIds } } } } : {}),
    };
  }

  /** Fisher–Yates 부분 셔플로 n개 표본을 뽑는다. */
  private sample(ids: string[], n: number): string[] {
    const arr = [...ids];
    const count = Math.min(n, arr.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  }
}
