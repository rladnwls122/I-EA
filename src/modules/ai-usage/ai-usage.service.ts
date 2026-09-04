import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LlmPricingService } from './llm-pricing';
import { rangeStart, USAGE_TOP_USERS } from './llm-usage.constants';

/** 원장 한 묶음의 합계. costMicros는 단가 미설정이면 null이다(0이 아니다). */
export interface UsageTotals {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  costMicros: number | null;
}

const ZERO: UsageTotals = {
  calls: 0,
  promptTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  totalTokens: 0,
  costMicros: null,
};

/**
 * LLM 원가 원장 집계.
 *
 * 모든 합계는 DB에서 groupBy/aggregate로 접는다 — 원장은 사용자 수 × 호출 수로 자라므로
 * 행을 앱으로 끌어와 더하면 조회 자체가 원가가 된다.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: LlmPricingService,
  ) {}

  /** 내 사용량 — 기간 합계 + 기능별 + 일자별. 본인 행만 본다. */
  async forUser(userId: string, days: number, now: Date = new Date()) {
    const since = rangeStart(days, now);
    const where = { userId, createdAt: { gte: since } };

    const [totals, byFeature, byDay] = await Promise.all([
      this.totalsOf(where),
      this.groupTotals(where, 'feature'),
      this.groupTotals(where, 'usageDate'),
    ]);

    return {
      rangeDays: days,
      since,
      // 단가가 없으면 원가는 전부 null로 나간다. 화면이 "0원"으로 오해하지 않도록 명시한다.
      pricingConfigured: this.pricing.prices !== null,
      totals,
      byFeature,
      byDay,
    };
  }

  /**
   * 전체 사용량 — 운영 원가 대시보드(ADMIN). 기간 합계 + 기능별 + 일자별 + 상위 사용자.
   *
   * 상위 사용자를 함께 주는 이유: 총원가만으로는 "정상 성장"과 "한 계정의 어뷰징"을
   * 구분할 수 없다. 상한을 어디에 걸지 정하려면 분포를 봐야 한다.
   */
  async forAdmin(days: number, now: Date = new Date()) {
    const since = rangeStart(days, now);
    const where = { createdAt: { gte: since } };

    const [totals, byFeature, byDay, topUserRows] = await Promise.all([
      this.totalsOf(where),
      this.groupTotals(where, 'feature'),
      this.groupTotals(where, 'usageDate'),
      this.prisma.llmUsage.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, costMicros: true },
        orderBy: { _sum: { totalTokens: 'desc' } },
        take: USAGE_TOP_USERS,
      }),
    ]);

    // 상위 사용자에게만 이메일/닉네임을 붙인다 — 원장 자체는 id만 들고 있다.
    const users = await this.prisma.user.findMany({
      where: { id: { in: topUserRows.map((r) => r.userId) } },
      select: { id: true, email: true, nickname: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      rangeDays: days,
      since,
      pricingConfigured: this.pricing.prices !== null,
      totals,
      byFeature,
      byDay,
      topUsers: topUserRows.map((r) => ({
        userId: r.userId,
        email: byId.get(r.userId)?.email ?? null,
        nickname: byId.get(r.userId)?.nickname ?? null,
        calls: r._count._all,
        totalTokens: r._sum.totalTokens ?? 0,
        costMicros: r._sum.costMicros ?? null,
      })),
    };
  }

  // --- 내부 헬퍼 -------------------------------------------------------

  private async totalsOf(where: object): Promise<UsageTotals> {
    const agg = await this.prisma.llmUsage.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        promptTokens: true,
        outputTokens: true,
        thinkingTokens: true,
        totalTokens: true,
        costMicros: true,
      },
    });
    if (agg._count._all === 0) return ZERO;
    return {
      calls: agg._count._all,
      promptTokens: agg._sum.promptTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      thinkingTokens: agg._sum.thinkingTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      // SUM은 값이 전부 null이면 null을 준다 — 그대로 흘린다(단가 미설정과 같은 뜻).
      costMicros: agg._sum.costMicros,
    };
  }

  /**
   * `feature` 또는 `usageDate`로 묶은 합계. 두 축이 같은 모양이라 한 함수로 둔다.
   * 일자 축은 `usageDate`(앱 기준 날짜 문자열)로 묶는다 — 이유는 스키마 주석 참고.
   */
  private async groupTotals(where: object, by: 'feature' | 'usageDate') {
    const rows = await this.prisma.llmUsage.groupBy({
      by: [by],
      where,
      _count: { _all: true },
      _sum: { promptTokens: true, outputTokens: true, totalTokens: true, costMicros: true },
      orderBy: by === 'usageDate' ? { usageDate: 'asc' } : { _sum: { totalTokens: 'desc' } },
    });
    return rows.map((r) => ({
      key: r[by] as string,
      calls: r._count._all,
      promptTokens: r._sum.promptTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      totalTokens: r._sum.totalTokens ?? 0,
      costMicros: r._sum.costMicros,
    }));
  }
}
