import { computeStreak } from '@/common/constants/xp';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('computeStreak + shield', () => {
  it('하루 결석 + shield 있으면 스트릭 유지·소모', () => {
    // 마지막 학습 7/10, 오늘 7/12 (하루 공백), shield 1
    const r = computeStreak(d('2026-07-10'), 5, d('2026-07-12'), 1);
    expect(r.currentStreak).toBe(6); // 유지+오늘
    expect(r.counted).toBe(true);
    expect(r.shieldConsumed).toBe(true);
  });

  it('하루 결석 + shield 없으면 리셋', () => {
    const r = computeStreak(d('2026-07-10'), 5, d('2026-07-12'), 0);
    expect(r.currentStreak).toBe(1);
    expect(r.shieldConsumed).toBe(false);
  });

  it('연속(어제 학습)이면 shield 소모 안 함', () => {
    const r = computeStreak(d('2026-07-11'), 5, d('2026-07-12'), 3);
    expect(r.currentStreak).toBe(6);
    expect(r.shieldConsumed).toBe(false);
  });
});
