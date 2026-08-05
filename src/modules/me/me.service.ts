import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { REASON_LABELS, ReasonCode } from '@/common/constants/question';
import { KEYWORD_TAG_CATEGORY } from '@/common/constants/tag';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import {
  MILESTONES,
  milestoneProgress,
  titleForLevel,
  xpToNextTier,
} from '@/common/constants/xp';
import {
  AI_CREDIT_ITEM_KEY,
  aiFreeRemainingToday,
  getShopItem,
  ShopItemKey,
} from '@/common/constants/shop';
import { REVIEW_STATUS } from '@/modules/exam-sessions/review-state.util';
import { rankWeaknesses, type ReviewFailureInput } from './weakness.util';
import {
  judgeRubricScore,
  judgeRubricScoreByAxis,
  type RubricAxisInput,
} from './rubric-score.util';
import { buildReviewQueue } from './review-queue.util';
import { REVIEW_QUEUE_MAX_LIMIT } from './dto/query-review-queue.dto';

export interface WrongStat {
  key: string;
  label: string;
  total: number;
  wrong: number;
  wrongRatio: number;
}
export interface ReasonStat {
  code: string;
  label: string;
  count: number;
}

/**
 * bySubjectDetail의 미분류 버킷 키 — subject_detail_id가 null인 문항(기존 문항 전부)의 집계처.
 * 스키마 방침(subject_details 주석)대로 null은 숨기지 않고 "미분류"로 노출한다.
 */
export const UNCLASSIFIED_DETAIL_KEY = 'UNCLASSIFIED';
export const UNCLASSIFIED_DETAIL_LABEL = '미분류';

/**
 * 오답노트 채점 이력 조회 상한(#39 B-3) — 응답 크기 폭주 방지 보험.
 * 프론트 복습 큐 상한(100) + 통계 표본으로 충분한 값. 상한 도달 시 truncated=true로 알린다.
 */
export const NOTES_GRADED_LIMIT = 500;

/**
 * 축별 서술형 득점률을 접기 위해 끌어오는 답안 행 수 상한 (#33 도그푸딩 잔여 2).
 *
 * 전체 득점률(헤드라인)은 DB 집계라 상한이 없다. 여기만 상한이 있는 이유는 축별 분해가
 * 행을 앱으로 끌어와야 하기 때문이고, 2000으로 넉넉히 잡은 이유는 대상이 "채점기준표로
 * 채점된 서술형 답안"뿐이라 모집단 자체가 작기 때문이다 — 하루 두 문항씩 3년을 풀어야
 * 닿는 수다. 그래도 상한을 두는 건 NOTES_GRADED_LIMIT과 같은 보험이다.
 */
export const RUBRIC_AXIS_LIMIT = 2000;

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 진행 중(IN_PROGRESS) 세션 중 가장 최근 1개 — 대시보드 이어하기 배너용.
   * 없으면 null. answered는 답안이 저장된 문항 수(진행률 표시용).
   */
  async activeSession(userId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      include: {
        subject: { select: { name: true } },
        workbook: { select: { title: true } },
        sessionQuestions: { select: { answer: { select: { id: true } } } },
      },
    });
    if (!session) return null;

    return {
      id: session.id,
      subjectName: session.subject?.name ?? null,
      workbookTitle: session.workbook?.title ?? null,
      total: session.sessionQuestions.length,
      answered: session.sessionQuestions.filter((q) => q.answer != null).length,
      startedAt: session.startedAt,
    };
  }

  /** 풀이기록 — 제출된 세션 요약(최신순). */
  async examSessions(userId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: { userId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      include: {
        subject: { select: { name: true } },
        workbook: { select: { id: true, title: true } },
        sessionQuestions: { include: { answer: { select: { isCorrect: true } } } },
      },
    });
    return sessions.map((s) => {
      const total = s.sessionQuestions.length;
      const correct = s.sessionQuestions.filter((q) => q.answer?.isCorrect === true).length;
      return {
        id: s.id,
        // 문제집 응시(Pick & Mix)는 교차 과목이라 소분류가 없다. 대신 문제집 제목을 노출한다.
        subjectName: s.subject?.name ?? null,
        // 복습(오답노트 출처) 세션 여부 — 목록에서 복습 회차를 구분해 표기한다.
        isReview: s.isReview,
        workbookId: s.workbook?.id ?? null,
        workbookTitle: s.workbook?.title ?? null,
        status: s.status,
        submittedAt: s.submittedAt,
        total,
        correct,
        scorePercent: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
        durationSec: s.durationSec,
      };
    });
  }

  /** XP 적립 원장(최신순, 오프셋 페이지네이션). 각 행: 순증감·사유·잔액·세부내역. */
  async xpHistory(userId: string, query: PaginationQueryDto) {
    const { page, limit, skip } = query;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.xpHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.xpHistory.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * 마일스톤 대시보드 — 정의 순서대로 달성 여부/달성시각/진행률(현재·목표·비율)/잠금(선행 미달성).
   * summary에 현재 xp·레벨·타이틀·스트릭·다음 티어까지 남은 xp·달성 수를 함께 제공한다.
   */
  async milestones(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true, currentStreak: true, longestStreak: true },
    });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const rows = await this.prisma.milestoneAchievement.findMany({ where: { userId } });
    const achieved = new Map(rows.map((r) => [r.milestoneKey, r.achievedAt]));
    const milestones = milestoneProgress(user.xp, user.longestStreak, achieved);

    return {
      summary: {
        xp: user.xp,
        level: user.level,
        title: titleForLevel(user.level),
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        xpToNextTier: xpToNextTier(user.xp),
        achievedCount: achieved.size,
        totalCount: MILESTONES.length,
      },
      milestones,
    };
  }

  /**
   * 통합 오답노트 — 통계(bySubject/bySubjectDetail/byType/byReason) + 오답 문항 + 각 문항의 내 주석을 한 번에.
   * 정오가 확정된(is_correct NOT NULL) 답안만 통계 대상(서술형은 자기채점 후 반영).
   * filter(시험/대분류/세부과목)가 오면 그 범위의 문항만 집계한다.
   */
  async notes(
    userId: string,
    filter: { examType?: string; examCategory?: string; subjectId?: string } = {},
  ) {
    // 세부과목 3단 필터 — subjects 테이블 기준. 값이 없으면 조건 자체를 생략.
    const subjectWhere =
      filter.examType || filter.examCategory
        ? {
            ...(filter.examType ? { examType: filter.examType } : {}),
            ...(filter.examCategory ? { examCategory: filter.examCategory } : {}),
          }
        : undefined;
    const questionWhere =
      filter.subjectId || subjectWhere
        ? {
            ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
            ...(subjectWhere ? { subject: subjectWhere } : {}),
          }
        : undefined;

    // 1차 응시(isReview: false)만 집계한다(#39 B-1) — 복습은 정의상 틀린 문제만 다시 푸는
    // 행위라, 섞이면 과목별 정답률이 실력과 무관하게 출렁인다. 오답 판정도 1차 응시 기준.
    // (복습에서 또 틀린 것은 복습 상태 테이블이 별도로 추적한다.)
    // 최신 제출 순 + 상한(#39 B-3) — 채점 시각 컬럼이 없어 세션 제출 시각을 정렬 기준으로 쓴다.
    // 상한+1건을 조회해 초과분 존재 여부로 truncated를 판정한다(정확히 상한 건수일 때 오판정 방지).
    const gradedRows = await this.prisma.examSessionAnswer.findMany({
      where: {
        isCorrect: { not: null },
        examSessionQuestion: {
          examSession: { userId, status: 'SUBMITTED', isReview: false },
          ...(questionWhere ? { question: questionWhere } : {}),
        },
      },
      orderBy: { examSessionQuestion: { examSession: { submittedAt: 'desc' } } },
      take: NOTES_GRADED_LIMIT + 1,
      include: {
        examSessionQuestion: {
          select: {
            examSessionId: true,
            questionId: true,
            question: {
              select: {
                subjectId: true,
                questionType: true,
                stem: true,
                difficulty: true,
                subject: { select: { name: true } },
                // 하위요소(4단계)별 오답 통계용 — null(미분류)은 미분류 버킷으로 집계한다.
                subjectDetailId: true,
                detail: { select: { name: true } },
                // 개념별(#키워드) 오답 통계용 — "키워드" 카테고리 태그만.
                questionTags: {
                  where: { tag: { category: KEYWORD_TAG_CATEGORY } },
                  select: { tag: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });

    // 상한 초과 여부 판정 후, 여분 1건은 집계에 섞이지 않게 잘라낸다.
    const truncated = gradedRows.length > NOTES_GRADED_LIMIT;
    const graded = truncated ? gradedRows.slice(0, NOTES_GRADED_LIMIT) : gradedRows;

    const subjectMap = new Map<string, WrongStat>();
    const typeMap = new Map<string, WrongStat>();
    // 하위요소(4단계)별 통계 — 약점 진단(#37)의 분류축. null은 미분류 버킷으로 흘린다.
    const detailMap = new Map<string, WrongStat>();
    // 개념별(#키워드) 오답 통계 — 태그 id로 집계하고 라벨은 태그명을 쓴다.
    const keywordMap = new Map<string, WrongStat>();
    const sessionIds = new Set<string>();
    /** 문항 → 하위요소 축 key. 아래에서 주석의 reasonCode를 축별로 접는 데 쓴다(#37). */
    const detailKeyByQuestion = new Map<string, string>();
    const wrongList: {
      questionId: string;
      subjectId: string;
      subjectName: string;
      questionType: string;
      stem: unknown;
      difficulty: number;
      sessionId: string;
    }[] = [];
    let solved = 0;
    let correct = 0;

    const bump = (map: Map<string, WrongStat>, key: string, label: string, isWrong: boolean) => {
      const cur = map.get(key) ?? { key, label, total: 0, wrong: 0, wrongRatio: 0 };
      cur.total += 1;
      if (isWrong) cur.wrong += 1;
      cur.wrongRatio = Math.round((cur.wrong / cur.total) * 100) / 100;
      map.set(key, cur);
    };

    for (const a of graded) {
      const sq = a.examSessionQuestion;
      const q = sq.question;
      const isWrong = a.isCorrect === false;
      solved += 1;
      if (a.isCorrect === true) correct += 1;
      sessionIds.add(sq.examSessionId);
      bump(subjectMap, q.subjectId, q.subject.name, isWrong);
      bump(typeMap, q.questionType, q.questionType, isWrong);
      // 하위요소 미지정(기존 문항 전부 null)은 미분류 버킷에 쌓아 표본이 새지 않게 한다.
      const detailKey = q.subjectDetailId && q.detail ? q.subjectDetailId : UNCLASSIFIED_DETAIL_KEY;
      if (q.subjectDetailId && q.detail) {
        bump(detailMap, q.subjectDetailId, q.detail.name, isWrong);
      } else {
        bump(detailMap, UNCLASSIFIED_DETAIL_KEY, UNCLASSIFIED_DETAIL_LABEL, isWrong);
      }
      // 약점 진단(#37)에서 축별 오답 원인을 세려면 문항이 어느 축인지 알아야 한다.
      // byReason은 전체 합산이라 "이 하위요소에서 실수가 많다"를 말할 수 없다.
      detailKeyByQuestion.set(sq.questionId, detailKey);
      for (const qt of q.questionTags) {
        bump(keywordMap, qt.tag.id, qt.tag.name, isWrong);
      }
      if (isWrong) {
        wrongList.push({
          questionId: sq.questionId,
          subjectId: q.subjectId,
          subjectName: q.subject.name,
          questionType: q.questionType,
          stem: q.stem,
          difficulty: q.difficulty,
          sessionId: sq.examSessionId,
        });
      }
    }

    // 미채점 서술형(#39 B-2) — 제출 완료된 1차 응시 세션에서 자기채점이 아직 안 된(is_correct
    // IS NULL) 답안 수. 리마인드용 카운트만 노출하고 복습 큐에는 넣지 않는다(채점이 상태 전이의
    // 입력이므로, 채점 전 문항을 복습시키는 것은 복습이 아니라 채점 독촉이다).
    const ungradedCount = await this.prisma.examSessionAnswer.count({
      where: {
        isCorrect: null,
        examSessionQuestion: {
          examSession: { userId, status: 'SUBMITTED', isReview: false },
          ...(questionWhere ? { question: questionWhere } : {}),
        },
      },
    });

    // 서술형 부분점수 지표(#43 gap 8 후속) — 채점기준표로 채점된 답안의 평균 득점률.
    //
    // 왜 여기(별도 엔드포인트가 아니라 /me/notes 응답)인가: 결정 A(#37)와 같은 이유다.
    // 범위 필터(questionWhere)·1차 응시 조건·인가 경로가 이미 이 요청 안에 다 있고, 별도
    // 엔드포인트로 빼면 그 조건을 두 벌 유지하면서 왕복만 한 번 더 생긴다. 다만 이쪽은
    // "무거운 집계를 두 번 돈다"는 부분이 그대로 적용되진 않는다 — 아래는 쿼리 한 방이다.
    //
    // 왜 위 graded 루프에서 같이 세지 않고 별도 집계인가: graded는 응답 크기 보험으로
    // 500건에 잘려 있다(NOTES_GRADED_LIMIT). 잘린 표본으로 평균을 내면 "최근 500건의
    // 득점률"이 되는데, 그건 화면이 말하는 값이 아니다. **집계를 DB에서 하면** 행을 앱으로
    // 끌어오지 않으므로 상한을 걸 이유 자체가 없다 — 컬럼을 꺼낸 이유가 그것이다.
    //
    // 두 컬럼이 NOT NULL인 답안 = 채점기준표로 채점된 답안. rubric 없는 서술형은 두 컬럼이
    // null로 남으므로(exam-sessions.service의 rubricGradingWrite) 이 조건이 곧 대상 선별이다.
    //
    // 조건 객체를 변수로 뽑아 아래 축별 조회와 **같은 것을 쓴다**. 같은 필터를 두 벌
    // 적어 두면 언젠가 한쪽만 고쳐져 전체 득점률과 축별 득점률이 서로 다른 모집단을 말한다.
    const rubricWhere = {
      earnedPoints: { not: null },
      rubricTotalPoints: { not: null },
      examSessionQuestion: {
        examSession: { userId, status: 'SUBMITTED', isReview: false },
        ...(questionWhere ? { question: questionWhere } : {}),
      },
    } as const;
    const rubricAgg = await this.prisma.examSessionAnswer.aggregate({
      where: rubricWhere,
      _sum: { earnedPoints: true, rubricTotalPoints: true },
      _count: true,
    });
    // Decimal 컬럼이라 Prisma가 Decimal 객체를 돌려준다 — 응답으로 나가기 전에 숫자로 접는다
    // (JSON 직렬화가 문자열로 바꿔 놓는다). 저장소 관행: exam-sessions의 `Number(q.points)`.
    const rubricOverall = judgeRubricScore({
      count: rubricAgg._count,
      earnedPoints: Number(rubricAgg._sum.earnedPoints ?? 0),
      totalPoints: Number(rubricAgg._sum.rubricTotalPoints ?? 0),
    });

    // 분류축(하위요소)별 득점률 (#33 도그푸딩 잔여 2) — 전체 하나로는 "서술형이 약하다"까지만
    // 알 수 있고 **어느 서술형인지**를 못 말한다.
    //
    // 축이 questions 쪽 컬럼이라 Prisma groupBy로는 못 묶는다(조인 컬럼 그룹화 불가).
    // 남는 선택지는 (a) 축마다 쿼리, (b) raw SQL, (c) 행을 받아 앱에서 접기였다.
    //   (a)는 축 수만큼 쿼리가 늘고, (b)는 위 필터를 SQL로 **한 벌 더** 적어야 해서
    //   언젠가 한쪽만 고쳐진다. (c)를 골랐다 — 대상이 "채점기준표로 채점된 서술형 답안"뿐이라
    //   모집단 자체가 작고(한 세션에 한두 문항), 위 where 객체를 그대로 재사용할 수 있다.
    //
    // 전체 득점률을 이 행들로 다시 계산하지 않는 이유: 이 조회에는 상한이 있고 위 집계에는
    // 없다. 헤드라인 숫자는 상한 밖에서 정확해야 한다 — 컬럼을 꺼낸 이유가 그것이다.
    const rubricRows = rubricOverall
      ? await this.prisma.examSessionAnswer.findMany({
          where: rubricWhere,
          take: RUBRIC_AXIS_LIMIT,
          orderBy: { examSessionQuestion: { examSession: { submittedAt: 'desc' } } },
          select: {
            earnedPoints: true,
            rubricTotalPoints: true,
            examSessionQuestion: {
              select: {
                question: {
                  select: { subjectDetailId: true, detail: { select: { name: true } } },
                },
              },
            },
          },
        })
      : []; // 전체가 하한 미달이면 축은 볼 것도 없다(부분집합이라 반드시 미달이다).

    const rubricAxisMap = new Map<string, RubricAxisInput>();
    for (const row of rubricRows) {
      const q = row.examSessionQuestion.question;
      const key = q.subjectDetailId && q.detail ? q.subjectDetailId : UNCLASSIFIED_DETAIL_KEY;
      const label = q.subjectDetailId && q.detail ? q.detail.name : UNCLASSIFIED_DETAIL_LABEL;
      const cur = rubricAxisMap.get(key) ?? { key, label, count: 0, earnedPoints: 0, totalPoints: 0 };
      cur.count += 1;
      cur.earnedPoints += Number(row.earnedPoints ?? 0);
      cur.totalPoints += Number(row.rubricTotalPoints ?? 0);
      rubricAxisMap.set(key, cur);
    }
    const rubricScore = rubricOverall
      ? { ...rubricOverall, ...judgeRubricScoreByAxis([...rubricAxisMap.values()]) }
      : null;

    // 내 주석 — byReason 통계 + 오답 문항별 주석 조인.
    // 범위 필터가 있으면 그 범위에서 채점된 문항의 주석만 센다(원인 통계도 범위를 따라간다).
    const scopedQuestionIds = questionWhere
      ? Array.from(new Set(graded.map((a) => a.examSessionQuestion.questionId)))
      : null;
    const annotations = await this.prisma.userQuestionAnnotation.findMany({
      where: {
        userId,
        ...(scopedQuestionIds ? { questionId: { in: scopedQuestionIds } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    const annByQuestion = new Map<string, typeof annotations>();
    const reasonMap = new Map<string, number>();
    /** 축(하위요소) key → { reasonCode: count } — 약점 진단의 처방 분류에 쓴다(#37). */
    const reasonsByDetail = new Map<string, Map<string, number>>();
    for (const ann of annotations) {
      const list = annByQuestion.get(ann.questionId) ?? [];
      list.push(ann);
      annByQuestion.set(ann.questionId, list);
      if (ann.reasonCode) {
        reasonMap.set(ann.reasonCode, (reasonMap.get(ann.reasonCode) ?? 0) + 1);
        // 같은 원인을 축(하위요소)별로도 접어 둔다 — 처방(개념 vs 훈련) 판정 근거.
        const axisKey = detailKeyByQuestion.get(ann.questionId);
        if (axisKey) {
          const perAxis = reasonsByDetail.get(axisKey) ?? new Map<string, number>();
          perAxis.set(ann.reasonCode, (perAxis.get(ann.reasonCode) ?? 0) + 1);
          reasonsByDetail.set(axisKey, perAxis);
        }
      }
    }
    const byReason: ReasonStat[] = [...reasonMap.entries()].map(([code, count]) => ({
      code,
      label: REASON_LABELS[code as ReasonCode] ?? code,
      count,
    }));

    // 복습 상태(O/세모/X/마스터) — 유저 전체를 한 번의 findMany로 배치 조회(N+1 금지).
    // 오답 문항별 reviewState 조인과 summary.review(due/byStatus) 집계에 함께 쓴다.
    // due/byStatus는 범위 필터와 무관하게 유저 전체 기준이다.
    const reviewRows = await this.prisma.userQuestionReviewState.findMany({
      where: { userId },
      select: { questionId: true, status: true, consecutiveCorrect: true, nextReviewAt: true },
    });
    const reviewByQuestion = new Map(
      reviewRows.map((r) => [
        r.questionId,
        { status: r.status, consecutiveCorrect: r.consecutiveCorrect, nextReviewAt: r.nextReviewAt },
      ]),
    );
    const now = new Date();
    const byStatus: Record<string, number> = {
      [REVIEW_STATUS.O]: 0,
      [REVIEW_STATUS.TRIANGLE]: 0,
      [REVIEW_STATUS.X]: 0,
      [REVIEW_STATUS.MASTERED]: 0,
    };
    // due = 재노출 시각이 도래한(마스터 제외) 복습 대기 문항 수.
    let due = 0;
    for (const r of reviewRows) {
      if (r.status in byStatus) byStatus[r.status] += 1;
      if (r.status !== REVIEW_STATUS.MASTERED && r.nextReviewAt !== null && r.nextReviewAt <= now) {
        due += 1;
      }
    }

    // 복습 실패율(#37) — "복습에서도 또 틀림"(X→X). 상태 테이블은 현재 값만 들고 있어
    // 셀 수 없던 신호라 전이 이력(user_question_review_transitions)을 따로 읽는다.
    // 조회 대상을 위에서 축을 확정한 문항(detailKeyByQuestion)으로 한정하는 이유가 둘이다:
    //   (1) 축을 모르는 전이는 어차피 집계에 못 쓴다. (2) 범위 필터와 상한(500)이 그대로 따라와
    //       유저 전체 이력이 무한정 딸려오지 않는다.
    // fromStatus = X인 행만 가져온다 — 분모가 "X 상태에서 일어난 전이 전부"이기 때문.
    const axisQuestionIds = [...detailKeyByQuestion.keys()];
    const reviewFailureByDetail = new Map<string, ReviewFailureInput>();
    if (axisQuestionIds.length > 0) {
      const xTransitions = await this.prisma.userQuestionReviewTransition.findMany({
        where: { userId, fromStatus: REVIEW_STATUS.X, questionId: { in: axisQuestionIds } },
        select: { questionId: true, correct: true },
      });
      for (const t of xTransitions) {
        const axisKey = detailKeyByQuestion.get(t.questionId);
        if (!axisKey) continue;
        const cur = reviewFailureByDetail.get(axisKey) ?? { fromX: 0, failed: 0 };
        cur.fromX += 1;
        if (!t.correct) cur.failed += 1;
        reviewFailureByDetail.set(axisKey, cur);
      }
    }

    const wrongQuestions = wrongList.map((w) => {
      const anns = annByQuestion.get(w.questionId) ?? [];
      return {
        ...w,
        annotationCount: anns.length,
        annotations: anns,
        // 이 문항의 내 복습 상태(기록 없으면 null) — 복습 진입 버튼/뱃지용.
        reviewState: reviewByQuestion.get(w.questionId) ?? null,
      };
    });

    return {
      summary: {
        sessions: sessionIds.size,
        solved,
        correct,
        scorePercent: solved > 0 ? Math.round((correct / solved) * 1000) / 10 : 0,
        bySubject: [...subjectMap.values()],
        // 하위요소별(4단계) — 약점 진단(#37)용. total(표본)·wrong에서 정답 수(total-wrong)가 나온다.
        bySubjectDetail: [...detailMap.values()],
        byType: [...typeMap.values()],
        byReason,
        // 개념별 오답 — 틀린 횟수 많은 순. 오답이 하나도 없는 키워드는 노출하지 않는다.
        byKeyword: [...keywordMap.values()]
          .filter((k) => k.wrong > 0)
          .sort((a, b) => b.wrong - a.wrong || b.wrongRatio - a.wrongRatio),
        // 복습 큐 현황(유저 전체 기준, 필터 무관) — due = 재노출 도래 수, byStatus = 상태별 분포.
        review: { due, byStatus },
        // 자기채점 대기 서술형 답안 수(#39 B-2) — 범위 필터를 따라간다. 0이면 프론트에서 숨김.
        ungradedCount,
        /**
         * 서술형 평균 득점률(#43 gap 8 후속) — 채점기준표로 채점된 답안만, 1차 응시 기준.
         * 표본 하한(RUBRIC_SCORE_MIN_SAMPLE) 미만이거나 서술형 채점 이력이 없으면 null이다.
         * null = "판정 불가"이지 "0점"이 아니다 — 화면은 아무것도 띄우지 않는다.
         */
        rubricScore,
        /**
         * 약점 진단(#37) — 하위요소 축 기준 상위 3개 + 표본 부족 축.
         * 여기서 계산해 내려주는 이유: 집계가 이미 이 요청 안에 다 있어 추가 쿼리가 없고,
         * 표본 하한·점수식 같은 진단 규칙을 화면마다 다르게 구현하지 않게 하려는 것.
         * 복습 실패율도 이미 접어 둔 집계 형태로만 넘긴다 — weakness.util은 DB를 모른다.
         */
        weakness: rankWeaknesses([...detailMap.values()], reasonsByDetail, 3, reviewFailureByDetail),
      },
      wrongQuestions,
      // 채점 이력이 조회 상한(NOTES_GRADED_LIMIT)에 걸려 잘렸는지(#39 B-3).
      truncated,
    };
  }

  /**
   * 복습 요약(#39 C) — 전역 내비 due 배지용 경량 조회. 전량 로드 없이 count 두 번만.
   *   due: 재노출 시각이 도래한(마스터 제외) 복습 대기 문항 수 — notes()의 due 정의와 동일.
   *   ungraded: 제출 완료된 1차 응시 세션의 자기채점 대기 서술형 답안 수 — notes()의 ungradedCount와 동일.
   */
  async reviewSummary(userId: string) {
    const now = new Date();
    const [due, ungraded] = await Promise.all([
      // nextReviewAt <= now 조건은 null을 매칭하지 않으므로 O/MASTERED(null)는 자연 제외되지만,
      // notes() 집계와 정의를 정확히 맞추기 위해 MASTERED 제외 조건을 명시한다.
      this.prisma.userQuestionReviewState.count({
        where: {
          userId,
          status: { not: REVIEW_STATUS.MASTERED },
          nextReviewAt: { lte: now },
        },
      }),
      this.prisma.examSessionAnswer.count({
        where: {
          isCorrect: null,
          examSessionQuestion: { examSession: { userId, status: 'SUBMITTED', isReview: false } },
        },
      }),
    ]);
    return { due, ungraded };
  }

  /**
   * 복습 큐 — 지금 풀어야 할 문항 id를 급한 순으로.
   *
   * 원래 프런트가 `/me/notes` 전량을 받아 조립했다. 그 응답은 채점 이력 상한 500에 잘려서
   * (#39 B-3), **오래 푼 사용자일수록 복습해야 할 문항이 큐에서 조용히 빠졌다.**
   * 응답에 `truncated`를 실어 경고는 했지만 경고가 누락을 고치지는 못한다.
   *
   * 큐가 봐야 하는 건 채점 이력이 아니라 복습 상태다. 상태 테이블을 직접 읽으면 상한과
   * 무관하게 정확하고, due 배지(`reviewSummary`)와 데이터 출처도 하나가 된다.
   * 조립 규칙은 순수 함수(`buildReviewQueue`)에 있다.
   */
  async reviewQueue(
    userId: string,
    query: {
      examType?: string;
      examCategory?: string;
      subjectId?: string;
      limit?: number;
      includeMastered?: boolean;
    } = {},
  ) {
    const questionWhere = this.buildQuestionScope(query);
    const includeMastered = query.includeMastered ?? false;
    const limit = query.limit ?? REVIEW_QUEUE_MAX_LIMIT;

    // O(처음부터 맞음)는 애초에 복습 대상이 아니라 DB에서 걷어낸다 — 큐 규칙과 같은 판단이지만,
    // 여기서 빼야 상한을 넘길 만큼 큰 사용자에서도 불필요한 행을 나르지 않는다.
    // MASTERED는 토글에 따라 필요할 수 있어 남긴다.
    const rows = await this.prisma.userQuestionReviewState.findMany({
      where: {
        userId,
        status: includeMastered
          ? { not: REVIEW_STATUS.O }
          : { notIn: [REVIEW_STATUS.O, REVIEW_STATUS.MASTERED] },
        ...(questionWhere ? { question: questionWhere } : {}),
      },
      select: { questionId: true, status: true, nextReviewAt: true },
      // 정렬의 정본은 buildReviewQueue다. 여기 orderBy는 "예정일이 이른 것부터"라는
      // 같은 방향을 미리 줘서, 아래 slice가 급한 것을 자르지 않게 하는 보험이다.
      orderBy: [{ nextReviewAt: 'asc' }],
    });

    const questionIds = buildReviewQueue(rows, { includeMastered, now: new Date() });
    return {
      questionIds: questionIds.slice(0, limit),
      /** 상한을 넘은 잔여분 — 화면이 "남은 N문항은 다음 복습에서" 안내에 쓴다. */
      remaining: Math.max(0, questionIds.length - limit),
    };
  }

  /**
   * 시험·대분류·세부과목 3단 범위를 Question where 절로. 값이 없으면 undefined(조건 생략).
   * 오답노트와 복습 큐가 같은 규약을 써야 사용자가 보는 범위와 복습 범위가 어긋나지 않는다.
   */
  private buildQuestionScope(filter: {
    examType?: string;
    examCategory?: string;
    subjectId?: string;
  }) {
    const subjectWhere =
      filter.examType || filter.examCategory
        ? {
            ...(filter.examType ? { examType: filter.examType } : {}),
            ...(filter.examCategory ? { examCategory: filter.examCategory } : {}),
          }
        : undefined;
    return filter.subjectId || subjectWhere
      ? {
          ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
          ...(subjectWhere ? { subject: subjectWhere } : {}),
        }
      : undefined;
  }

  /** 지갑 — 코인·XP부스터·인벤토리(보호권/힌트)·코스메틱 보유·칭호·이름색·미개봉 상자 수. */
  async wallet(userId: string) {
    const [user, inv, unopenedBoxCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          coins: true,
          xpBoostUntil: true,
          equippedTitle: true,
          nameColor: true,
          aiFreeDate: true,
          aiFreeUsed: true,
        },
      }),
      this.prisma.userInventory.findMany({
        where: { userId },
        select: { itemKey: true, quantity: true },
      }),
      this.prisma.lootBox.count({ where: { userId, openedAt: null } }),
    ]);
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const qty = (k: string) => inv.find((i) => i.itemKey === k)?.quantity ?? 0;
    return {
      coins: user.coins,
      xpBoostUntil: user.xpBoostUntil,
      // HINT_TOKEN은 폐기됐다(2026-08-04 응시 중 AI 힌트 제거 → 2026-08-04 보유분 리셋).
      // 후신은 AI_CREDIT이고 복습 튜터 대화 한 턴에 1개 쓴다.
      inventory: { STREAK_SHIELD: qty('STREAK_SHIELD'), AI_CREDIT: qty(AI_CREDIT_ITEM_KEY) },
      // 오늘 남은 무료 턴. 크레딧보다 먼저 소모되므로 UI가 이걸 앞에 보여줘야
      // "왜 산 게 안 줄지?"라는 오해가 안 생긴다.
      aiFreeRemaining: aiFreeRemainingToday(user.aiFreeDate, user.aiFreeUsed, new Date()),
      cosmetics: {
        owned: inv.filter((i) => i.itemKey.startsWith('COSMETIC_') && i.quantity > 0).map((i) => i.itemKey),
        equippedTitle: user.equippedTitle,
        nameColor: user.nameColor,
      },
      unopenedBoxCount,
    };
  }

  /** 내 구매 이력(최신순) — 실물 쿠폰 배송 상태(PENDING/FULFILLED) 포함. */
  purchases(userId: string) {
    return this.prisma.purchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 코스메틱 장착 — 소유 검증 후 칭호/이름색 세팅. 미소유·비코스메틱이면 BadRequest. */
  async equipCosmetic(userId: string, itemKey: string) {
    const item = getShopItem(itemKey as ShopItemKey);
    if (!item || item.effect.type !== 'COSMETIC') {
      throw new BadRequestException('꾸미기 아이템이 아닙니다.');
    }
    const owned = await this.prisma.userInventory.findUnique({
      where: { userId_itemKey: { userId, itemKey } },
      select: { quantity: true },
    });
    if (!owned || owned.quantity < 1) throw new BadRequestException('보유하지 않은 아이템입니다.');
    const eff = item.effect;
    await this.prisma.user.update({
      where: { id: userId },
      data: { [eff.field]: eff.value },
    });
    return { equipped: itemKey };
  }
}
