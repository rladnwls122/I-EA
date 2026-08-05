/**
 * `questions.metadata` 취급 규칙 한곳.
 *
 * metadata는 "스키마 컬럼을 늘리지 않고 문항에 붙이는 부가 정보"의 자리라 주인이 여럿이다 —
 * 지문 내장 빈칸 번호(`blankIndex`), OX 스타일 표시, AI 자기검증 기록(`review`).
 * 주인이 여럿인 필드를 통째로 교체하면 **한 주인의 쓰기가 다른 주인의 값을 지운다.**
 * 그 규칙을 서비스 여기저기에 흩어 두지 않고 이 파일에 모은다.
 */

/** 자기검증 판정값. null(판정 안 함)과 ERROR(판정하려다 실패)는 다른 상태다. */
export const REVIEW_VERDICTS = ['PASS', 'REVISE', 'ERROR'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

/**
 * PATCH의 metadata를 기존 값과 **얕게** 병합한다.
 *
 * - 보낸 키만 덮어쓰고 나머지는 남는다. 캔버스가 `{ review }`만 보내도 `blankIndex`가 살아 있다.
 * - 키를 지우는 표현은 값 `null`이다(`{ blankIndex: null }`). 필드 생략은 PATCH 규약상
 *   "안 건드림"이라, 병합만 두면 키를 지울 방법이 사라진다 — `rubric`의 빈 배열과 같은 문법.
 * - 병합 결과가 비면 `null`을 돌려준다. 빈 객체를 남기면 화면이 "메타데이터 있음"으로 읽는다
 *   (`stripInternalReview`가 같은 이유로 쓰는 규칙).
 * - 깊은 병합은 하지 않는다. `review.axes` 같은 배열을 만나면 "붙이나 갈아치우나"가 모호해지고,
 *   판정은 통째로 갈아치우는 게 맞다.
 */
export function mergeMetadata(
  existing: unknown,
  incoming: Record<string, unknown>,
): Record<string, unknown> | null {
  const base = isPlainObject(existing) ? { ...existing } : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) delete base[key];
    else base[key] = value;
  }
  return Object.keys(base).length > 0 ? base : null;
}

/**
 * metadata에서 자기검증 판정값을 꺼낸다 — 집계용 컬럼(`questions.review_verdict`)에 쓸 값.
 *
 * 컬럼과 Json을 **같은 쓰기 경로에서** 함께 채우기 위한 단일 출처다. 갈라지면 언젠가
 * 한쪽만 갱신되고, 그때 품질 지표는 조용히 거짓말을 시작한다.
 * 판정이 없거나 모르는 값이면 `null` — 넣지 못할 값을 억지로 넣지 않는다.
 */
export function readReviewVerdict(metadata: unknown): ReviewVerdict | null {
  if (!isPlainObject(metadata)) return null;
  const review = metadata.review;
  if (!isPlainObject(review)) return null;
  const verdict = review.verdict;
  return typeof verdict === 'string' && (REVIEW_VERDICTS as readonly string[]).includes(verdict)
    ? (verdict as ReviewVerdict)
    : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
