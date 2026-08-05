import {
  judgeRubricScore,
  judgeRubricScoreByAxis,
  RUBRIC_SCORE_MIN_SAMPLE,
} from './rubric-score.util';

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

describe('judgeRubricScoreByAxis', () => {
  const axis = (key: string, count: number, earned: number, total: number) => ({
    key,
    label: key,
    count,
    earnedPoints: earned,
    totalPoints: total,
  });

  it('낮은 득점률부터 세운다 — 화면 첫 줄이 다음에 손볼 곳이다', () => {
    const out = judgeRubricScoreByAxis([
      axis('높음', 3, 27, 30),
      axis('낮음', 3, 9, 30),
      axis('중간', 3, 18, 30),
    ]);
    expect(out.byDetail.map((d) => d.key)).toEqual(['낮음', '중간', '높음']);
  });

  it('같은 득점률이면 표본이 많은 축이 먼저다 — 근거가 두꺼운 쪽', () => {
    const out = judgeRubricScoreByAxis([axis('적음', 3, 15, 30), axis('많음', 9, 45, 90)]);
    expect(out.byDetail.map((d) => d.key)).toEqual(['많음', '적음']);
  });

  it('하한 미달 축은 판정에서 빼되 목록으로는 남긴다 — 숨기면 어디로 갔는지 알 수 없다', () => {
    const out = judgeRubricScoreByAxis([axis('충분', 3, 15, 30), axis('부족', 2, 10, 20)]);
    expect(out.byDetail.map((d) => d.key)).toEqual(['충분']);
    expect(out.needsMoreData).toEqual([{ key: '부족', label: '부족', count: 2 }]);
  });

  it('만점 0인 축(옛 스냅샷)은 판정도 예고도 하지 않는다 — 0으로 나눈 값이 실리면 안 된다', () => {
    const out = judgeRubricScoreByAxis([axis('망가짐', 5, 0, 0)]);
    expect(out.byDetail).toEqual([]);
    // 표본은 있으나 비율을 못 내는 축이라 "조금 더 풀면 된다"고 말하면 거짓말이 된다…
    // 지만 표본 수 자체는 사실이므로 목록에는 남는다(하한 미달과 같은 취급).
    expect(out.needsMoreData).toEqual([{ key: '망가짐', label: '망가짐', count: 5 }]);
  });
});
