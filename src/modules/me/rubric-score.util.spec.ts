import { judgeRubricScore, RUBRIC_SCORE_MIN_SAMPLE } from './rubric-score.util';

describe('judgeRubricScore', () => {
  it('Σ획득 / Σ만점으로 득점률을 낸다(소수 둘째 자리)', () => {
    expect(judgeRubricScore({ count: 4, earnedPoints: 27, totalPoints: 40 })).toEqual({
      count: 4,
      earnedPoints: 27,
      totalPoints: 40,
      ratio: 0.68, // 0.675 → 반올림
    });
  });

  /**
   * 답안별 득점률의 산술평균이 아니라 합계 비율이다.
   * 20점짜리에서 2점, 4점짜리에서 4점을 받았다면 실제로 받은 건 24점 중 6점(25%)이지
   * (10% + 100%) / 2 = 55%가 아니다. 후자는 성적표와 어긋난다.
   */
  it('배점이 큰 문항이 더 무겁게 실린다 — 답안별 비율의 평균이 아니다', () => {
    const score = judgeRubricScore({ count: 3, earnedPoints: 6, totalPoints: 24 });
    expect(score?.ratio).toBe(0.25);
  });

  it(`표본이 ${RUBRIC_SCORE_MIN_SAMPLE} 미만이면 판정하지 않는다(null)`, () => {
    expect(
      judgeRubricScore({ count: RUBRIC_SCORE_MIN_SAMPLE - 1, earnedPoints: 1, totalPoints: 10 }),
    ).toBeNull();
    expect(
      judgeRubricScore({ count: RUBRIC_SCORE_MIN_SAMPLE, earnedPoints: 1, totalPoints: 10 }),
    ).not.toBeNull();
  });

  it('만점 합이 0이면 판정하지 않는다 — 0으로 나눈 값이 지표에 실리면 안 된다', () => {
    expect(judgeRubricScore({ count: 5, earnedPoints: 0, totalPoints: 0 })).toBeNull();
  });

  it('전부 0점이어도 판정은 한다(0%는 "모른다"가 아니라 결과다)', () => {
    expect(judgeRubricScore({ count: 5, earnedPoints: 0, totalPoints: 50 })?.ratio).toBe(0);
  });
});
