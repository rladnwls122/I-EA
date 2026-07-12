// 상점·상자 시스템 단일 소스(가격·드롭률·아이템 효과). xp.ts/question.ts 패턴을 따른다.

export const BOX_TIERS = ['COMMON', 'RARE', 'LEGENDARY'] as const;
export type BoxTier = (typeof BOX_TIERS)[number];

/** 제출당 상자 드롭 확률. */
export const BOX_DROP_CHANCE = 0.6;

/** 정답률(0~100)별 등급 가중치. 높을수록 상위 등급↑. */
export function tierWeights(scorePercent: number): Record<BoxTier, number> {
  if (scorePercent >= 80) return { COMMON: 40, RARE: 45, LEGENDARY: 15 };
  if (scorePercent >= 50) return { COMMON: 60, RARE: 33, LEGENDARY: 7 };
  return { COMMON: 80, RARE: 18, LEGENDARY: 2 };
}

/** 등급별 코인 범위(포함). */
export const COIN_RANGE: Record<BoxTier, readonly [number, number]> = {
  COMMON: [10, 30],
  RARE: [40, 80],
  LEGENDARY: [120, 250],
};

/** 드롭 판정 + 등급 롤. 미드롭이면 null. rng는 [0,1). */
export function rollBoxTier(
  scorePercent: number,
  rng: () => number = Math.random,
): BoxTier | null {
  if (rng() >= BOX_DROP_CHANCE) return null;
  const weights = tierWeights(scorePercent);
  const total = BOX_TIERS.reduce((s, t) => s + weights[t], 0);
  let roll = rng() * total;
  for (const t of BOX_TIERS) {
    roll -= weights[t];
    if (roll < 0) return t;
  }
  return 'LEGENDARY'; // 부동소수 잔차 방어
}

/** 등급 범위 내 균등 정수 코인. */
export function rollCoins(tier: BoxTier, rng: () => number = Math.random): number {
  const [lo, hi] = COIN_RANGE[tier];
  return lo + Math.floor(rng() * (hi - lo + 1));
}
