import { resolveHintQuota } from '@/modules/exam-sessions/hint-quota';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('resolveHintQuota', () => {
  it('오늘 무료 0/3 → 무료 사용', () => {
    expect(resolveHintQuota(d('2026-07-12'), 0, 0, d('2026-07-12')))
      .toEqual({ allow: true, useToken: false, newFreeUsed: 1 });
  });
  it('날짜 바뀌면 무료 카운트 리셋', () => {
    expect(resolveHintQuota(d('2026-07-11'), 3, 0, d('2026-07-12')))
      .toEqual({ allow: true, useToken: false, newFreeUsed: 1 });
  });
  it('무료 3/3 + 토큰 있으면 토큰 사용', () => {
    expect(resolveHintQuota(d('2026-07-12'), 3, 2, d('2026-07-12')))
      .toEqual({ allow: true, useToken: true, newFreeUsed: 3 });
  });
  it('무료 3/3 + 토큰 0 → 차단', () => {
    expect(resolveHintQuota(d('2026-07-12'), 3, 0, d('2026-07-12')))
      .toEqual({ allow: false, useToken: false, newFreeUsed: 3 });
  });
});
