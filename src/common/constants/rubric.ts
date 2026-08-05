/**
 * 서술형 채점기준표(rubric) 계약 — 앱 전 계층(DTO 검증·스냅샷·자기채점)의 단일 출처.
 *
 * 내신 서·논술형은 "맞았다/틀렸다"로 채점되지 않는다. 채점기준 여러 개에 배점이 쪼개져 있고
 * 응시자가 충족한 기준의 배점 합이 그 문항의 점수다(부분점수). `questions.rubric`은 그
 * 기준 배열을 담고, 없으면(null) 기존대로 정오 2지선다 자기채점이다.
 *
 * `id`는 선지(`c1`..`c8`)와 같은 문항 로컬 문자열이다 — 전역 유일할 필요가 없고, 대신
 * 답안(exam_session_answers)에 "체크한 기준 id"로 박히므로 문항 안에서는 유일해야 한다.
 * 선지 id와 같은 이유로, 기준을 재배열·교체하면 과거 채점 기록이 다른 기준을 가리킨다.
 */
export interface RubricCriterion {
  /** 문항 로컬 식별자(선지 관행과 동일하게 `c1`..). 문항 안에서 유일. */
  id: string;
  /** 기준 서술("광합성 명반응 산물 2개를 모두 언급"). 평문이다 — 리치텍스트가 아니다. */
  text: string;
  /** 이 기준을 충족했을 때 얻는 점수. 0보다 커야 한다. */
  points: number;
}

/**
 * 기준 개수 상한. 내신 서술형 채점기준표는 실무상 3~6개이고, 두 자릿수를 넘기면
 * 채점 체크리스트가 화면에서 읽히지 않는다. Json 컬럼이라 DB가 막아주지 않으므로
 * 여기가 유일한 방어선이다.
 */
export const RUBRIC_MAX_CRITERIA = 12;

/** 기준 서술 길이 상한. 한 줄 체크리스트 항목으로 읽혀야 한다. */
export const RUBRIC_MAX_TEXT_LENGTH = 300;

/** 기준 id 길이 상한 — 선지 id(36자)와 같은 기준. */
export const RUBRIC_MAX_ID_LENGTH = 36;

/** 개별 기준 배점 상한. 문항 배점(points)과 굳이 묶지 않는다(출제 도중 합이 맞지 않는 게 정상). */
export const RUBRIC_MAX_CRITERION_POINTS = 1000;

/** 기준 배점 합 상한. 부분점수 비율 계산의 분모라, 폭주하면 비율이 무의미해진다. */
export const RUBRIC_MAX_TOTAL_POINTS = 1000;

/** 배점 소수 자릿수 상한(0.5점 단위 채점 대응). 이보다 잘게 쓰면 표시·합산이 흔들린다. */
export const RUBRIC_POINTS_DECIMALS = 2;
