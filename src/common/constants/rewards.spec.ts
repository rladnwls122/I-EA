import {
  resolveAuthorRewardQuota, rollForkCoins,
  AUTHOR_PUBLISH_DAILY_CAP, SOLVE_MILESTONE_THRESHOLD,
} from '@/common/constants/shop';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('resolveAuthorRewardQuota', () => {
  it('오늘 0/3 → 허용, count 1', () => {
    expect(resolveAuthorRewardQuota(d('2026-07-13'), 0, d('2026-07-13')))
      .toEqual({ allow: true, newCount: 1 });
  });
  it('날짜 바뀌면 카운트 리셋 → 허용', () => {
    expect(resolveAuthorRewardQuota(d('2026-07-12'), 3, d('2026-07-13')))
      .toEqual({ allow: true, newCount: 1 });
  });
  it('오늘 3/3 → 차단, count 3 유지', () => {
    expect(resolveAuthorRewardQuota(d('2026-07-13'), 3, d('2026-07-13')))
      .toEqual({ allow: false, newCount: 3 });
  });
  it('rewardDate null → 허용', () => {
    expect(resolveAuthorRewardQuota(null, 0, d('2026-07-13')))
      .toEqual({ allow: true, newCount: 1 });
  });
});

describe('rollForkCoins', () => {
  it('[5,10] 경계', () => {
    expect(rollForkCoins(() => 0)).toBe(5);
    expect(rollForkCoins(() => 0.999)).toBe(10);
  });
});

describe('상수', () => {
  it('캡 3, 마일스톤 10', () => {
    expect(AUTHOR_PUBLISH_DAILY_CAP).toBe(3);
    expect(SOLVE_MILESTONE_THRESHOLD).toBe(10);
  });
});
