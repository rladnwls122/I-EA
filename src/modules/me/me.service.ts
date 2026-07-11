import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { REASON_LABELS, ReasonCode } from '@/common/constants/question';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import {
  MILESTONES,
  milestoneProgress,
  titleForLevel,
  xpToNextTier,
} from '@/common/constants/xp';

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

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

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
   */
  async notes(userId: string) {
    const graded = await this.prisma.examSessionAnswer.findMany({
      where: {
        isCorrect: { not: null },
        examSessionQuestion: { examSession: { userId, status: 'SUBMITTED' } },
      },
      include: {
        examSessionQuestion: {
          select: {
            examSessionId: true,
            questionId: true,
            question: {
              select: { subjectId: true, questionType: true, subject: { select: { name: true } } },
            },
          },
        },
      },
    });

    const subjectMap = new Map<string, WrongStat>();
    const typeMap = new Map<string, WrongStat>();
    const sessionIds = new Set<string>();
    const wrongList: {
      questionId: string;
      subjectId: string;
      subjectName: string;
      questionType: string;
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
      if (isWrong) {
        wrongList.push({
          questionId: sq.questionId,
          subjectId: q.subjectId,
          subjectName: q.subject.name,
          questionType: q.questionType,
          sessionId: sq.examSessionId,
        });
      }
    }

    // 내 주석 — byReason 통계 + 오답 문항별 주석 조인.
    const annotations = await this.prisma.userQuestionAnnotation.findMany({
      where: { userId },
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

    const wrongQuestions = wrongList.map((w) => {
      const anns = annByQuestion.get(w.questionId) ?? [];
      return { ...w, annotationCount: anns.length, annotations: anns };
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
      },
      wrongQuestions,
    };
  }
}
