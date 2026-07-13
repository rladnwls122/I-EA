import { HINT_FREE_PER_DAY } from '@/common/constants/shop';

function dayNum(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** 오늘 힌트를 열 수 있는지 + 토큰 소모 여부 + 갱신된 무료 사용수. */
export function resolveHintQuota(
  hintFreeDate: Date | null | undefined,
  hintFreeUsed: number,
  tokenQty: number,
  today: Date,
): { allow: boolean; useToken: boolean; newFreeUsed: number } {
  const sameDay = !!hintFreeDate && dayNum(hintFreeDate) === dayNum(today);
  const usedToday = sameDay ? hintFreeUsed : 0;
  if (usedToday < HINT_FREE_PER_DAY) {
    return { allow: true, useToken: false, newFreeUsed: usedToday + 1 };
  }
  if (tokenQty > 0) {
    return { allow: true, useToken: true, newFreeUsed: HINT_FREE_PER_DAY };
  }
  return { allow: false, useToken: false, newFreeUsed: HINT_FREE_PER_DAY };
}
