// =====================================================================
// 오답 복습 상태 전이(이슈 #15 확정 결정) — 순수 함수.
//   상태 4종: O(맞음) / TRIANGLE(재도전 성공, 세모) / X(틀림) / MASTERED(마스터)
//   상태별 고정 간격: X = +1일, TRIANGLE = +3일 후 재노출. O/MASTERED = 복습 제외(null).
//   마스터 조건: 틀린 문항을 2연속 정답(X → TRIANGLE → MASTERED)하면 복습에서 제외.
// grading.util.ts처럼 DB 무관 순수 함수로 두어 서비스 트랜잭션 어디서든 재사용한다.
// =====================================================================

/** 복습 상태 코드 — user_question_review_states.status의 단일 출처(VARCHAR 패턴). */
export const REVIEW_STATUS = {
  /** 처음부터 맞음 — 복습 대상 아님 */
  O: 'O',
  /** 틀렸다가 재도전 성공(세모) — 3일 후 재노출 */
  TRIANGLE: 'TRIANGLE',
  /** 틀림 — 1일 후 재노출 */
  X: 'X',
  /** 2연속 정답 — 복습 제외 */
  MASTERED: 'MASTERED',
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

/** 상태별 고정 재노출 간격(일). O/MASTERED는 재노출 없음(null). */
export const REVIEW_INTERVAL_DAYS: Readonly<Record<'X' | 'TRIANGLE', number>> = {
  X: 1,
  TRIANGLE: 3,
};

/** 전이 계산에 필요한 기존 상태의 최소 형태(DB 행에서 발췌). */
export interface ReviewStatePrev {
  status: string; // DB는 VARCHAR — 방어적으로 string을 받고 내부에서 좁힌다.
  consecutiveCorrect: number;
}

/** 전이 결과 — upsert에 그대로 쓸 수 있는 형태. */
export interface ReviewStateNext {
  status: ReviewStatus;
  consecutiveCorrect: number;
  nextReviewAt: Date | null;
}

/** now 기준 days일 뒤 시각. */
function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * 채점 결과 하나(isCorrect)로 복습 상태를 전이한다.
 *
 *   없음      + 정답 → O         (1, null)  — 처음부터 맞음, 복습 대상 아님
 *   O         + 정답 → O 유지    (+1, null)
 *   X         + 정답 → TRIANGLE  (1, +3일)  — 재도전 성공
 *   TRIANGLE  + 정답 → MASTERED  (2, null)  — 2연속 정답, 복습 제외
 *   MASTERED  + 정답 → MASTERED 유지 (+1, null)
 *   (any)     + 오답 → X         (0, +1일)
 *     — MASTERED + 오답도 X로 리셋한다(이슈 #15에서 미확정이었으나 리셋 채택:
 *       마스터한 문항을 다시 틀렸다면 더 이상 마스터가 아니다).
 */
export function transitionReviewState(
  prev: ReviewStatePrev | null,
  isCorrect: boolean,
  now: Date,
): ReviewStateNext {
  // 오답은 기존 상태와 무관하게 X로 수렴한다(마스터 리셋 포함).
  if (!isCorrect) {
    return {
      status: REVIEW_STATUS.X,
      consecutiveCorrect: 0,
      nextReviewAt: addDays(now, REVIEW_INTERVAL_DAYS.X),
    };
  }

  switch (prev?.status) {
    case REVIEW_STATUS.O:
      // 계속 맞는 문항 — 복습 대상 아님, 연속 정답만 누적.
      return { status: REVIEW_STATUS.O, consecutiveCorrect: prev.consecutiveCorrect + 1, nextReviewAt: null };
    case REVIEW_STATUS.X:
      // 틀렸던 문항 재도전 성공 — 세모, 3일 후 한 번 더 확인.
      return {
        status: REVIEW_STATUS.TRIANGLE,
        consecutiveCorrect: 1,
        nextReviewAt: addDays(now, REVIEW_INTERVAL_DAYS.TRIANGLE),
      };
    case REVIEW_STATUS.TRIANGLE:
      // 2연속 정답 달성 — 마스터, 복습 큐에서 제외.
      return { status: REVIEW_STATUS.MASTERED, consecutiveCorrect: 2, nextReviewAt: null };
    case REVIEW_STATUS.MASTERED:
      // 이미 마스터 — 유지.
      return {
        status: REVIEW_STATUS.MASTERED,
        consecutiveCorrect: prev.consecutiveCorrect + 1,
        nextReviewAt: null,
      };
    default:
      // 기록 없음(또는 알 수 없는 상태) + 정답 — 처음부터 맞음.
      return { status: REVIEW_STATUS.O, consecutiveCorrect: 1, nextReviewAt: null };
  }
}
