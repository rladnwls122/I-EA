/**
 * LLM 원가 원장(`llm_usage`)의 계약 — 앱 전 계층(기록·집계·조회)의 단일 출처.
 *
 * `feature`는 enum이 아니라 VARCHAR로 저장한다(questionType과 같은 패턴). DB가 값을
 * 막아주지 않으므로 여기가 정본이다.
 */

/**
 * 원가를 태우는 호출 지점. 하나의 사용자 행동이 여러 호출을 유발할 수 있으므로
 * (문항 생성 1회 = GENERATION + SELF_REVIEW) 행동이 아니라 **호출** 단위로 나눈다.
 */
export const LLM_FEATURES = [
  /** 문항 생성 본호출(지문 + N문항). 가장 비싼 경로다. */
  'GENERATION',
  /** 생성 결과 자가검수(옵트인). 켜면 생성 1건의 원가가 두 호출로 늘어난다. */
  'SELF_REVIEW',
  /** 선지 인라인 재생성. */
  'CHOICES',
  /** 복습 튜터 채팅(스트리밍). 턴당 AI 크레딧 1개를 이미 소모한다. */
  'TUTOR',
  /** 출제 스튜디오 채팅(스트리밍). */
  'AUTHORING',
] as const;
export type LlmFeature = (typeof LLM_FEATURES)[number];

/** 호출 결과. 실패도 기록한다 — 실패율 자체가 원가 지표다. */
export const LLM_USAGE_STATUSES = ['OK', 'FAILED'] as const;
export type LlmUsageStatus = (typeof LLM_USAGE_STATUSES)[number];

/**
 * 조회 가능한 최대 기간(일). 원장은 사용자 수 × 호출 수로 자라므로 상한 없이
 * 열어 두면 한 요청이 테이블을 통째로 훑는다(NOTES_GRADED_LIMIT과 같은 판단).
 */
export const USAGE_MAX_RANGE_DAYS = 90;

/** 기간을 지정하지 않았을 때의 기본 조회 일수. */
export const USAGE_DEFAULT_RANGE_DAYS = 30;

/** 관리자 집계에서 상위 사용자를 몇 명까지 보여줄지. */
export const USAGE_TOP_USERS = 20;

/**
 * 원장에 박히는 날짜 문자열(YYYY-MM-DD).
 *
 * `aiDayNum`(무료 크레딧)·스트릭 판정과 같은 **서버 로컬 기준**을 쓴다. DB에서
 * `DATE(created_at)`으로 뽑으면 DB 타임존이 기준이 되어, 같은 시스템 안에 하루 경계가
 * 둘 생긴다 — "오늘 무료분을 다 썼다"와 "오늘 원가"가 다른 날을 가리키게 된다.
 */
export function usageDateOf(at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `days`일 전 0시(서버 로컬). 조회 범위의 시작점 — 원장 인덱스(created_at)를 탄다. */
export function rangeStart(days: number, now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));
  return start;
}
