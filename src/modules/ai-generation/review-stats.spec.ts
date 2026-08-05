import { foldReviewRows, ReviewStatsRow } from './review-stats';

const at = (y: number, m: number, d: number, h = 12): Date => new Date(y, m - 1, d, h);

const row = (
  date: Date,
  verdict: string | null,
  axes?: unknown,
): ReviewStatsRow => ({
  createdAt: date,
  reviewVerdict: verdict,
  metadata: axes === undefined ? null : { review: { verdict, axes } },
});

describe('foldReviewRows — 축·일자 분해', () => {
  it('REVISE의 축만 센다 — PASS에 딸려 온 축은 "자주 걸리는 축"을 오염시킨다', () => {
    const { byAxis } = foldReviewRows([
      row(at(2026, 8, 5), 'REVISE', ['오답매력도', '발문형식']),
      row(at(2026, 8, 5), 'REVISE', ['오답매력도']),
      row(at(2026, 8, 5), 'PASS', ['오답매력도']),
    ]);
    expect(byAxis).toEqual([
      { axis: '오답매력도', count: 2 },
      { axis: '발문형식', count: 1 },
    ]);
  });

  it('모르는 축 문자열은 버린다 — 통계 축은 프롬프트가 아니라 코드가 정한다', () => {
    const { byAxis } = foldReviewRows([row(at(2026, 8, 5), 'REVISE', ['해괴한축', '발문형식'])]);
    expect(byAxis).toEqual([{ axis: '발문형식', count: 1 }]);
  });

  it('한 문항에서 같은 축이 두 번 나와도 한 번만 센다 — 문항 수를 세는 지표다', () => {
    const { byAxis } = foldReviewRows([row(at(2026, 8, 5), 'REVISE', ['발문형식', '발문형식'])]);
    expect(byAxis).toEqual([{ axis: '발문형식', count: 1 }]);
  });

  it('일자별로 판정을 세고 최신이 앞이다', () => {
    const { byDay } = foldReviewRows([
      row(at(2026, 8, 4), 'PASS'),
      row(at(2026, 8, 5), 'REVISE', ['발문형식']),
      row(at(2026, 8, 5), 'ERROR'),
    ]);
    expect(byDay).toEqual([
      { date: '2026-08-05', pass: 0, revise: 1, error: 1 },
      { date: '2026-08-04', pass: 1, revise: 0, error: 0 },
    ]);
  });

  it('새벽에 만든 문항이 전날로 밀리지 않는다(로컬 일자 기준)', () => {
    const { byDay } = foldReviewRows([row(at(2026, 8, 5, 1), 'PASS')]);
    expect(byDay[0].date).toBe('2026-08-05');
  });

  it('표본이 상한에 닿았는지 알려준다 — 화면이 "전부"로 읽으면 안 된다', () => {
    expect(foldReviewRows([row(at(2026, 8, 5), 'PASS')]).capped).toBe(false);
    expect(foldReviewRows([]).sampled).toBe(0);
  });
});
