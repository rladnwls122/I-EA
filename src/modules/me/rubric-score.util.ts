/**
 * 서술형 부분점수 지표 (#43 gap 8 후속).
 *
 * weakness.util과 같은 자리 — 순수 함수만 둔다. 서비스가 DB에서 접어 온 합계만 받고
 * 이 파일은 DB를 모른다. 판정 규칙(표본 하한·비율 정의)이 화면마다 달라지지 않게
 * 여기 한 곳에 두고 테스트로 고정한다.
 *
 * 신호의 전제는 정답률 통계와 같다: 1차 응시(isReview: false)만 집계한다(#39 B-1).
 * 복습은 정의상 틀린 문제만 다시 푸는 행위라, 섞이면 득점률이 실력과 무관하게 내려간다.
 */

/**
 * 득점률을 판정하는 최소 표본(= 채점기준표로 채점된 답안 수).
 *
 * 정답률 쪽 하한(WEAKNESS_MIN_SAMPLE = 5)보다 낮게 잡는 이유는 복습 실패율(3)과 같다:
 * 서술형은 한 세션에 한두 문항 들어가는 게 보통이라 분모가 구조적으로 훨씬 작다.
 * 5로 맞추면 대부분의 학습자에게 이 지표가 영원히 뜨지 않는다.
 * 게다가 표본 하나가 정오 이진값이 아니라 0~1 연속값(기준 여러 개의 배점 합)이라
 * 같은 개수라도 담는 정보가 많다. 그래도 1~2건으로 "평균 득점률"이라 말하는 건
 * 오도라 3을 하한으로 둔다 — 하한 미만이면 아무것도 말하지 않는다(null).
 */
export const RUBRIC_SCORE_MIN_SAMPLE = 3;

/** 서비스가 DB 집계(SUM/COUNT)에서 접어 넘기는 입력. */
export interface RubricScoreInput {
  /** 채점기준표로 채점된 답안 수(표본). */
  count: number;
  /** 획득 점수 합. */
  earnedPoints: number;
  /** 만점 합(분모). */
  totalPoints: number;
}

export interface RubricScore {
  /** 표본 수 — 비율만 보여주면 "3문항 중"과 "300문항 중"이 같아 보인다. 항상 병기한다. */
  count: number;
  earnedPoints: number;
  totalPoints: number;
  /** earnedPoints / totalPoints (0~1, 소수 둘째 자리). */
  ratio: number;
}

/**
 * 합계를 득점률 판정으로 접는다. 하한 미달이거나 분모가 0이면 null(판정 안 함).
 *
 * 비율을 **합계로** 내는 이유(답안별 득점률의 산술평균이 아니라 Σ획득/Σ만점):
 *  - 이게 실제로 "받은 점수 / 받을 수 있었던 점수"다. 배점 20점짜리 서술형과 4점짜리를
 *    같은 무게로 평균 내면 학습자가 체감하는 성적과 어긋난다.
 *  - 부수적으로 SQL SUM 두 개로 끝나 앱이 답안을 끌어올 필요가 없다 — 이 지표를 컬럼으로
 *    꺼낸 이유 자체가 그것이다.
 */
/** 축(하위요소) 하나의 합계. key/label은 bySubjectDetail·약점 진단과 같은 축 키를 쓴다. */
export interface RubricAxisInput extends RubricScoreInput {
  key: string;
  label: string;
}

export interface RubricAxisScore extends RubricScore {
  key: string;
  label: string;
}

/** 표본이 하한에 못 미쳐 판정을 미룬 축 — "왜 안 뜨는지"를 말해 주기 위한 목록. */
export interface RubricAxisPending {
  key: string;
  label: string;
  count: number;
}

export interface RubricAxisReport {
  /** 판정된 축 — **낮은 득점률부터**. 화면의 첫 줄이 곧 다음에 손볼 곳이어야 한다. */
  byDetail: RubricAxisScore[];
  /** 표본 부족으로 미룬 축. 약점 진단(#37)의 needsMoreData와 같은 문법. */
  needsMoreData: RubricAxisPending[];
}

/**
 * 축별 합계를 득점률 리포트로 접는다 (#33 도그푸딩 잔여 2).
 *
 * 전체 득점률 하나만으로는 "서술형이 약하다"까지만 알 수 있고 **어느 서술형인지**를
 * 말하지 못한다. 그런데 축을 쪼개면 표본이 축당 1~2건으로 흩어지기 쉬워서, 쪼갠 결과를
 * 그대로 늘어놓으면 "3문항 중 1문항 = 33%" 같은 숫자가 진단처럼 보인다.
 *
 * 그래서 판정 규칙은 전체와 **같은 하한**(RUBRIC_SCORE_MIN_SAMPLE)을 쓰되, 하한 미달 축을
 * 그냥 숨기지 않고 `needsMoreData`로 따로 돌려준다 — 숨기기만 하면 학습자는 자기가 푼
 * 서술형이 어디로 갔는지 알 수 없고, 화면은 "이 축은 아직 판정 못 한다"를 말할 수 있어야 한다.
 * (약점 진단의 needsMoreData가 같은 이유로 있다.)
 *
 * 정렬은 득점률 오름차순 — 같은 비율이면 표본이 많은 쪽이 먼저다(근거가 두꺼운 쪽).
 */
export function judgeRubricScoreByAxis(inputs: RubricAxisInput[]): RubricAxisReport {
  const byDetail: RubricAxisScore[] = [];
  const needsMoreData: RubricAxisPending[] = [];

  for (const input of inputs) {
    const judged = judgeRubricScore(input);
    if (judged) byDetail.push({ key: input.key, label: input.label, ...judged });
    else if (input.count > 0) {
      needsMoreData.push({ key: input.key, label: input.label, count: input.count });
    }
  }

  byDetail.sort((a, b) => a.ratio - b.ratio || b.count - a.count);
  needsMoreData.sort((a, b) => b.count - a.count);
  return { byDetail, needsMoreData };
}

export function judgeRubricScore(input: RubricScoreInput): RubricScore | null {
  if (input.count < RUBRIC_SCORE_MIN_SAMPLE) return null;
  // 만점 0은 정상 경로에서 나오지 않지만(rubric 검증이 배점 > 0을 강제한다), 옛 스냅샷으로
  // 채점된 기록이 섞이면 0으로 나눈 값이 지표에 실린다. 모르는 건 말하지 않는다.
  if (input.totalPoints <= 0) return null;

  return {
    count: input.count,
    earnedPoints: input.earnedPoints,
    totalPoints: input.totalPoints,
    ratio: Math.round((input.earnedPoints / input.totalPoints) * 100) / 100,
  };
}
