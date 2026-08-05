import {
  judgeReviewFailure,
  rankWeaknesses,
  weaknessScore,
  REVIEW_FAILURE_MIN_SAMPLE,
  REVIEW_FAILURE_WEIGHT,
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

describe('rankWeaknesses — 복습 실패율', () => {
  const rf = (m: Record<string, { fromX: number; failed: number }>) => new Map(Object.entries(m));

  it(`전이 표본이 ${REVIEW_FAILURE_MIN_SAMPLE} 미만이면 판정하지 않는다(null)`, () => {
    // 2번 중 2번 다 또 틀렸어도 "또 틀리는 유형"이라 단정하는 건 오진이다.
    const { weaknesses } = rankWeaknesses(
      [stat('a', 20, 10)],
      new Map(),
      3,
      rf({ a: { fromX: 2, failed: 2 } }),
    );
    expect(weaknesses[0].reviewFailure).toBeNull();
  });

  it('하한을 넘기면 비율·분모·분자를 함께 준다 (표본 병기)', () => {
    const { weaknesses } = rankWeaknesses(
      [stat('a', 20, 10)],
      new Map(),
      3,
      rf({ a: { fromX: 4, failed: 3 } }),
    );
    expect(weaknesses[0].reviewFailure).toEqual({
      total: 4,
      failed: 3,
      ratio: 0.75,
      stuck: true,
    });
  });

  it('절반 미만이면 판정은 하되 stuck은 아니다 — 복습이 먹히고 있다', () => {
    const { weaknesses } = rankWeaknesses(
      [stat('a', 20, 10)],
      new Map(),
      3,
      rf({ a: { fromX: 5, failed: 1 } }),
    );
    expect(weaknesses[0].reviewFailure).toMatchObject({ ratio: 0.2, stuck: false });
  });

  it('개념/훈련 라벨과 겹치지 않는 별개 축이다 (실수형이면서 재복습 실패 가능)', () => {
    const { weaknesses } = rankWeaknesses(
      [stat('a', 20, 10)],
      new Map([['a', new Map([['MISTAKE', 9]])]]),
      3,
      rf({ a: { fromX: 4, failed: 4 } }),
    );
    expect(weaknesses[0].kind).toBe('DRILL');
    expect(weaknesses[0].reviewFailure?.stuck).toBe(true);
  });

  it('신호가 없는 축은 점수·순위가 기존과 완전히 동일하다 (추가 정보로만 얹힌다)', () => {
    const stats = [stat('a', 20, 2), stat('b', 20, 16), stat('c', 20, 9), stat('d', 20, 12)];
    const before = rankWeaknesses(stats, new Map(), 3);
    // b에만 신호를 주되 실패율 0 — 배수가 정확히 1이라 점수가 흔들리면 안 된다.
    const after = rankWeaknesses(stats, new Map(), 3, rf({ b: { fromX: 4, failed: 0 } }));
    expect(after.weaknesses.map((w) => w.key)).toEqual(before.weaknesses.map((w) => w.key));
    expect(after.weaknesses.map((w) => w.score)).toEqual(before.weaknesses.map((w) => w.score));
  });

  it('판정 불가 축의 점수도 기존과 같다 — "모른다"가 감점도 가점도 되지 않는다', () => {
    const base = rankWeaknesses([stat('a', 20, 10)]).weaknesses[0].score;
    const withUnjudged = rankWeaknesses(
      [stat('a', 20, 10)],
      new Map(),
      3,
      rf({ a: { fromX: 2, failed: 2 } }),
    ).weaknesses[0].score;
    expect(withUnjudged).toBe(base);
  });

  it('재복습이 계속 실패하는 축은 같은 성적의 축보다 위로 온다', () => {
    // a와 b는 표본·오답 수가 같다 — 기존 점수식만으로는 동점이다.
    const { weaknesses } = rankWeaknesses(
      [stat('a', 20, 10), stat('b', 20, 10)],
      new Map(),
      2,
      rf({ b: { fromX: 4, failed: 4 } }),
    );
    expect(weaknesses.map((w) => w.key)).toEqual(['b', 'a']);
  });

  it(`가산 상한은 ${REVIEW_FAILURE_WEIGHT} 배율까지 — 주신호를 뒤집을 만큼 세지 않다`, () => {
    // 실패율 100%인 약한 축(오답률 20%)이 오답률 80%인 축을 넘어서면 안 된다.
    const { weaknesses } = rankWeaknesses(
      [stat('weak', 20, 4), stat('bad', 20, 16)],
      new Map(),
      2,
      rf({ weak: { fromX: 10, failed: 10 } }),
    );
    expect(weaknesses[0].key).toBe('bad');
  });
});

describe('judgeReviewFailure', () => {
  it('입력 자체가 없으면 null', () => {
    expect(judgeReviewFailure(undefined)).toBeNull();
  });

  it('경계값 — 분모가 정확히 하한이면 판정한다', () => {
    expect(judgeReviewFailure({ fromX: REVIEW_FAILURE_MIN_SAMPLE, failed: 2 })).toMatchObject({
      total: REVIEW_FAILURE_MIN_SAMPLE,
      failed: 2,
    });
  });

  it('경계값 — 비율이 정확히 임계면 stuck', () => {
    expect(judgeReviewFailure({ fromX: 4, failed: 2 })?.stuck).toBe(true);
    expect(judgeReviewFailure({ fromX: 5, failed: 2 })?.stuck).toBe(false);
  });
});
