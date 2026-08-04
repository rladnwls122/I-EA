import {
  rankWeaknesses,
  weaknessScore,
  WEAKNESS_MIN_SAMPLE,
  type WeaknessStatInput,
} from './weakness.util';

const stat = (key: string, total: number, wrong: number): WeaknessStatInput => ({
  key,
  label: key,
  total,
  wrong,
});

describe('weaknessScore', () => {
  it('오답률이 같으면 표본이 큰 쪽이 높다', () => {
    expect(weaknessScore(50, 25)).toBeGreaterThan(weaknessScore(10, 5));
  });

  it('표본이 같으면 많이 틀린 쪽이 높다', () => {
    expect(weaknessScore(20, 15)).toBeGreaterThan(weaknessScore(20, 5));
  });

  it('로그를 씌워 표본이 순위를 지배하지 않게 한다', () => {
    // 20문항 중 16개(80%) 틀린 축이, 100문항 중 30개(30%) 틀린 축보다 위여야 한다.
    // 표본을 선형으로 곱하면 뒤집힌다.
    expect(weaknessScore(20, 16)).toBeGreaterThan(weaknessScore(100, 30));
  });

  it('표본이 0이면 0', () => {
    expect(weaknessScore(0, 0)).toBe(0);
  });
});

describe('rankWeaknesses — 표본 하한', () => {
  it(`표본이 ${WEAKNESS_MIN_SAMPLE} 미만이면 순위에 넣지 않는다 (소표본 오진 방지)`, () => {
    const { weaknesses } = rankWeaknesses([stat('few', 3, 3)]);
    expect(weaknesses).toEqual([]);
  });

  it('표본 부족이지만 틀린 적 있는 축은 needsMoreData로 따로 알린다', () => {
    const { needsMoreData } = rankWeaknesses([stat('few', 3, 2)]);
    expect(needsMoreData).toEqual([{ key: 'few', label: 'few', total: 3 }]);
  });

  it('소표본이어도 다 맞혔으면 안내하지 않는다 — 안내가 소음이 된다', () => {
    const { needsMoreData } = rankWeaknesses([stat('perfect', 3, 0)]);
    expect(needsMoreData).toEqual([]);
  });

  it('표본이 충분해도 다 맞힌 축은 약점이 아니다', () => {
    const { weaknesses } = rankWeaknesses([stat('ok', 30, 0)]);
    expect(weaknesses).toEqual([]);
  });
});

describe('rankWeaknesses — 순위와 정답률', () => {
  it('점수 높은 순으로 상위 N개만 준다', () => {
    const { weaknesses } = rankWeaknesses(
      [stat('a', 20, 2), stat('b', 20, 16), stat('c', 20, 9), stat('d', 20, 12)],
      new Map(),
      3,
    );
    expect(weaknesses.map((w) => w.key)).toEqual(['b', 'd', 'c']);
  });

  it('정답률을 소수 한 자리까지 함께 준다(표본과 같이 봐야 오해가 없다)', () => {
    const { weaknesses } = rankWeaknesses([stat('a', 8, 3)]);
    expect(weaknesses[0]).toMatchObject({ total: 8, wrong: 3, accuracyPercent: 62.5 });
  });
});

describe('rankWeaknesses — 처방 분류(개념 vs 훈련)', () => {
  const reasons = (m: Record<string, number>) => new Map([['a', new Map(Object.entries(m))]]);

  it("'실수'가 절반 이상이면 훈련 부족(DRILL)", () => {
    const { weaknesses } = rankWeaknesses([stat('a', 20, 10)], reasons({ MISTAKE: 6, CONCEPT: 4 }));
    expect(weaknesses[0].kind).toBe('DRILL');
  });

  it("'개념부족'이 우세하면 개념 약점(CONCEPT)", () => {
    const { weaknesses } = rankWeaknesses([stat('a', 20, 10)], reasons({ MISTAKE: 2, CONCEPT: 8 }));
    expect(weaknesses[0].kind).toBe('CONCEPT');
  });

  it('원인 기록이 없으면 판단 근거가 없으니 CONCEPT 기본값', () => {
    const { weaknesses } = rankWeaknesses([stat('a', 20, 10)]);
    expect(weaknesses[0].kind).toBe('CONCEPT');
    expect(weaknesses[0].dominantReason).toBeNull();
  });

  it('가장 많이 찍힌 원인을 한국어 라벨과 함께 준다', () => {
    const { weaknesses } = rankWeaknesses([stat('a', 20, 10)], reasons({ MISTAKE: 2, TIME: 7 }));
    expect(weaknesses[0].dominantReason).toEqual({ code: 'TIME', label: '시간부족', count: 7 });
  });

  it('다른 축의 원인이 섞이지 않는다', () => {
    const byKey = new Map([
      ['a', new Map([['MISTAKE', 9]])],
      ['b', new Map([['CONCEPT', 9]])],
    ]);
    const { weaknesses } = rankWeaknesses([stat('a', 20, 10), stat('b', 20, 10)], byKey, 2);
    const kinds = Object.fromEntries(weaknesses.map((w) => [w.key, w.kind]));
    expect(kinds).toEqual({ a: 'DRILL', b: 'CONCEPT' });
  });
});
