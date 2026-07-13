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

export type ShopItemKind = 'BOOST' | 'CONSUMABLE' | 'COSMETIC' | 'PHYSICAL';

type BoostEffect = { type: 'BOOST'; hours: number };
type ConsumableEffect = { type: 'CONSUMABLE'; inventoryKey: 'STREAK_SHIELD' | 'HINT_TOKEN' };
type CosmeticEffect = { type: 'COSMETIC'; field: 'equippedTitle' | 'nameColor'; value: string };
type PhysicalEffect = { type: 'PHYSICAL' };
type ShopEffect = BoostEffect | ConsumableEffect | CosmeticEffect | PhysicalEffect;

export interface ShopItem {
  name: string;
  price: number;
  kind: ShopItemKind;
  effect: ShopEffect;
}

export const SHOP_ITEMS = {
  XP_BOOST:        { name: 'XP 부스터',       price: 100,  kind: 'BOOST',      effect: { type: 'BOOST', hours: 24 } },
  XP_BOOST_LARGE:  { name: '대형 XP 부스터',  price: 300,  kind: 'BOOST',      effect: { type: 'BOOST', hours: 72 } },
  STREAK_SHIELD:   { name: '연속학습 보호권', price: 250,  kind: 'CONSUMABLE', effect: { type: 'CONSUMABLE', inventoryKey: 'STREAK_SHIELD' } },
  HINT_TOKEN:      { name: '힌트 토큰',       price: 80,   kind: 'CONSUMABLE', effect: { type: 'CONSUMABLE', inventoryKey: 'HINT_TOKEN' } },
  COSMETIC_TITLE_MASTER:    { name: '칭호: 문제의 지배자', price: 150, kind: 'COSMETIC', effect: { type: 'COSMETIC', field: 'equippedTitle', value: '문제의 지배자' } },
  COSMETIC_NAMECOLOR_GOLD:  { name: '닉네임 색: 골드',     price: 200, kind: 'COSMETIC', effect: { type: 'COSMETIC', field: 'nameColor', value: '#E9B949' } },
  RICEBALL_COUPON: { name: '배불리주먹밥 쿠폰(실물)', price: 7777, kind: 'PHYSICAL', effect: { type: 'PHYSICAL' } },
} as const satisfies Record<string, ShopItem>;

export type ShopItemKey = keyof typeof SHOP_ITEMS;

export function getShopItem(key: ShopItemKey): ShopItem | undefined {
  return SHOP_ITEMS[key];
}

/** 대형 부스터용 시간 단위 만료(기존 boostExpiry는 날짜 단위). */
export function boostExpiryHours(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}

/** 힌트 하루 무료 횟수. */
export const HINT_FREE_PER_DAY = 3;

// ─── 저자 리워드(출제자 보상) 규칙 ───
export const AUTHOR_PUBLISH_REWARD = { exp: 20, coins: 20 } as const;
export const AUTHOR_PUBLISH_DAILY_CAP = 3;

function rewardDayNum(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** 공개 문제집 발행 보상 하루 캡. 날짜 바뀌면 카운트 리셋. */
export function resolveAuthorRewardQuota(
  rewardDate: Date | null | undefined,
  rewardCount: number,
  today: Date,
): { allow: boolean; newCount: number } {
  const sameDay = !!rewardDate && rewardDayNum(rewardDate) === rewardDayNum(today);
  const usedToday = sameDay ? rewardCount : 0;
  if (usedToday < AUTHOR_PUBLISH_DAILY_CAP) return { allow: true, newCount: usedToday + 1 };
  return { allow: false, newCount: AUTHOR_PUBLISH_DAILY_CAP };
}

export const FORK_COIN_MIN = 5;
export const FORK_COIN_MAX = 10;
/** 포크 보상 코인 [5,10] 균등 정수. */
export function rollForkCoins(rng: () => number = Math.random): number {
  return FORK_COIN_MIN + Math.floor(rng() * (FORK_COIN_MAX - FORK_COIN_MIN + 1));
}

export const SOLVE_MILESTONE_THRESHOLD = 10;
export const SOLVE_MILESTONE_COINS = 20;
