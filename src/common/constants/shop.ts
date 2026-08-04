// 상점·상자 시스템 단일 소스(가격·드롭률·아이템 효과). xp.ts/question.ts 패턴을 따른다.

export const BOX_TIERS = ['COMMON', 'RARE', 'LEGENDARY'] as const;
export type BoxTier = (typeof BOX_TIERS)[number];

/** 제출당 상자 드롭 확률. 1.0 = 제출 시 항상 상자 드롭(100%). */
export const BOX_DROP_CHANCE = 1.0;

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
/**
 * 소모품. `quantity`는 1회 구매로 들어오는 개수(생략 시 1).
 * 크레딧처럼 낱개 단가가 낮은 아이템은 묶음으로 팔아야 구매가 성립한다.
 */
type ConsumableEffect = {
  type: 'CONSUMABLE';
  inventoryKey: 'STREAK_SHIELD' | 'AI_CREDIT';
  quantity?: number;
};
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
  AI_CREDIT_PACK:  { name: 'AI 크레딧 10개',  price: 400,  kind: 'CONSUMABLE', effect: { type: 'CONSUMABLE', inventoryKey: 'AI_CREDIT', quantity: 10 } },
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

// ─── AI 크레딧 ───
//
// 폐기된 HINT_TOKEN의 자리를 잇는다. 하는 일이 같다 — "이 문항에 대해 AI가 도와준다".
// 다른 점은 소모처가 응시 중 힌트 1회가 아니라 **복습 튜터 대화 한 턴**이라는 것이다.
//
// 무료 5회/일: 힌트는 1회로 완결됐지만 대화는 몇 턴 오가야 하나의 이해가 된다.
// 예전 무료 3회를 그대로 쓰면 대화가 시작도 못 하고 끊긴다.
//
// 묶음 400코인(개당 40): HINT_TOKEN이 1회 80코인이었다. 턴 단가는 그 절반으로 둔다 —
// 같은 이유로, 한 턴이 힌트 한 번보다 정보량이 작기 때문이다. 제출 1회당 상자에서
// 평균 30~60코인이 나오므로 묶음 하나는 대략 제출 8~13회에 해당한다.

/** 인벤토리에서 AI 크레딧을 세는 키. 문자열을 여기저기 흩뿌리지 않는다. */
export const AI_CREDIT_ITEM_KEY = 'AI_CREDIT';

/** 하루 무료 AI 크레딧 사용 횟수. 날짜가 바뀌면 리셋된다. */
export const AI_FREE_PER_DAY = 5;

function aiDayNum(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * AI 크레딧을 쓸 수 있는지 + 무료분/보유분 중 무엇을 소모할지.
 *
 * 무료분을 **먼저** 태운다. 반대로 하면 매일 리셋되는 무료분이 그냥 증발하고
 * 사용자는 산 걸 먼저 잃는다.
 *
 * 순수 함수다 — 실제 차감은 호출부가 트랜잭션 안에서 다시 판정한다.
 * 여기 결과만 믿고 차감하면 동시 요청에 초과 사용이 생긴다.
 */
export function resolveAiCreditQuota(
  aiFreeDate: Date | null | undefined,
  aiFreeUsed: number,
  creditQty: number,
  today: Date,
): { allow: boolean; useCredit: boolean; newFreeUsed: number } {
  const sameDay = !!aiFreeDate && aiDayNum(aiFreeDate) === aiDayNum(today);
  const usedToday = sameDay ? aiFreeUsed : 0;
  if (usedToday < AI_FREE_PER_DAY) {
    return { allow: true, useCredit: false, newFreeUsed: usedToday + 1 };
  }
  if (creditQty > 0) {
    return { allow: true, useCredit: true, newFreeUsed: AI_FREE_PER_DAY };
  }
  return { allow: false, useCredit: false, newFreeUsed: AI_FREE_PER_DAY };
}

/** 오늘 남은 무료 턴 수. 지갑 표시용 — 소모 판정은 resolveAiCreditQuota가 한다. */
export function aiFreeRemainingToday(
  aiFreeDate: Date | null | undefined,
  aiFreeUsed: number,
  today: Date,
): number {
  const sameDay = !!aiFreeDate && aiDayNum(aiFreeDate) === aiDayNum(today);
  const usedToday = sameDay ? aiFreeUsed : 0;
  return Math.max(0, AI_FREE_PER_DAY - usedToday);
}

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
