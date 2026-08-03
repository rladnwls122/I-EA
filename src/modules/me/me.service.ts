import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  KEYWORD_TAG_CATEGORY,
  REASON_LABELS,
  ReasonCode,
} from '@/common/constants/question';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import {
  MILESTONES,
  milestoneProgress,
  titleForLevel,
  xpToNextTier,
} from '@/common/constants/xp';
import { getShopItem, ShopItemKey } from '@/common/constants/shop';
import { REVIEW_STATUS } from '@/modules/exam-sessions/review-state.util';

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
 * 오답노트 채점 이력 조회 상한(#39 B-3) — 응답 크기 폭주 방지 보험.
 * 프론트 복습 큐 상한(100) + 통계 표본으로 충분한 값. 상한 도달 시 truncated=true로 알린다.
 */
export const NOTES_GRADED_LIMIT = 500;

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
   * 통합 오답노트 — 통계(bySubject/byType/byReason) + 오답 문항 + 각 문항의 내 주석을 한 번에.
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
    // 개념별(#키워드) 오답 통계 — 태그 id로 집계하고 라벨은 태그명을 쓴다.
    const keywordMap = new Map<string, WrongStat>();
    const sessionIds = new Set<string>();
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
    for (const ann of annotations) {
      const list = annByQuestion.get(ann.questionId) ?? [];
      list.push(ann);
      annByQuestion.set(ann.questionId, list);
      if (ann.reasonCode) reasonMap.set(ann.reasonCode, (reasonMap.get(ann.reasonCode) ?? 0) + 1);
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

  /** 지갑 — 코인·XP부스터·인벤토리(보호권/힌트)·코스메틱 보유·칭호·이름색·미개봉 상자 수. */
  async wallet(userId: string) {
    const [user, inv, unopenedBoxCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { coins: true, xpBoostUntil: true, equippedTitle: true, nameColor: true },
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
      inventory: { STREAK_SHIELD: qty('STREAK_SHIELD'), HINT_TOKEN: qty('HINT_TOKEN') },
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
