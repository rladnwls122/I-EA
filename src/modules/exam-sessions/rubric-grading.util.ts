import { RubricCriterion } from '@/common/constants/rubric';

/**
 * 채점기준표 부분점수 규칙 — DB를 모르는 순수 모듈(grading.util·review-state.util과 같은 자리).
 *
 * 서술형 자기채점은 지금까지 "맞음/틀림" 하나였다. 내신 서·논술형은 그렇게 채점되지 않는다:
 * 기준마다 배점이 있고, 충족한 기준의 배점 합이 점수다. 여기서는 그 합산과, 합산 결과를
 * 기존 파이프라인이 요구하는 `isCorrect` 불리언으로 접는 규칙만 정한다.
 */

/**
 * 부분점수를 "정답"으로 접는 기준선 — **획득 점수가 만점의 60% 이상이면 정답**.
 *
 * 왜 경계가 필요한가: 이 저장소의 기존 경로가 전부 `isCorrect` 불리언을 입력으로 쓴다.
 * 문항 정답률 캐시(total/correctSolvedCount), 복습 상태 전이(O/△/X/마스터), XP 적립이
 * 모두 그렇다. 부분점수를 도입하면서 그 입력을 없앨 수는 없으니, 몇 점부터 정답으로
 * 볼지를 여기 한 곳에서 정한다.
 *
 * 왜 60%인가:
 *  - 0점 초과를 전부 정답으로 치면, 6개 기준 중 1개만 맞아도 정답 → 연속 2회로 MASTERED까지
 *    졸업한다. 복습이 가장 필요한 답안이 복습 대상에서 빠지는, 가장 나쁜 오염이다.
 *  - 반대로 만점만 정답으로 치면 부분점수를 도입한 이유가 사라진다(서술형은 만점이 드물다).
 *  - 학교 성취평가제가 원점수 60% 미만을 미도달(E)로 보는 관행과 같은 선이라, 학생이
 *    "이 정도면 맞은 것"이라고 느끼는 감각과도 어긋나지 않는다.
 * 점수 자체(earnedPoints/totalPoints)는 답안에 그대로 남으므로, 나중에 이 선을 바꾸거나
 * 과목별로 달리 두더라도 원본을 다시 읽어 재판정할 수 있다.
 */
export const RUBRIC_PASS_RATIO = 0.6;

/**
 * 경계 비교용 오차 허용치. 배점은 소수 2자리까지 허용되므로 `2.4 / 4`처럼 이진 부동소수로
 * 정확히 떨어지지 않는 비율이 나온다. 딱 60%인 답안이 부동소수 오차 하나로 오답이 되는 일을 막는다.
 */
const RATIO_EPSILON = 1e-9;

/** 배점 합산 결과 — exam_session_answers.annotations.rubricGrading에 그대로 저장된다. */
export interface RubricGrading {
  /** 응시자가 충족했다고 체크한 기준 id(중복 제거·rubric 순서). */
  checkedIds: string[];
  /** 체크한 기준의 배점 합. */
  earnedPoints: number;
  /** 기준 전체의 배점 합(만점). */
  totalPoints: number;
  /** 이 결과를 기존 파이프라인용 불리언으로 접은 값(RUBRIC_PASS_RATIO 기준). */
  isCorrect: boolean;
}

/** 합산 결과 + 호출부가 400으로 되돌려야 하는 "rubric에 없는 id". */
export interface RubricGradeResult extends RubricGrading {
  /** 이 문항의 rubric에 없는 기준 id. 클라이언트 버그이거나 조작이라 무시하지 않고 알린다. */
  unknownIds: string[];
}

/** 소수 2자리 반올림 — 0.1 + 0.2 = 0.30000000000000004가 점수로 저장되는 것을 막는다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Json 컬럼/스냅샷에서 rubric을 읽는 **유일한 입구**.
 *
 * 하나라도 형태가 어긋나면 부분 수용하지 않고 통째로 null을 돌려준다. 깨진 기준 하나를
 * 조용히 버리면 만점(분모)이 달라져 점수가 소리 없이 틀어지기 때문이다. null이면
 * 호출부는 기존 정오 2지선다 자기채점으로 되돌아간다 — 안전한 실패 방향이다.
 */
export function readRubric(value: unknown): RubricCriterion[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const out: RubricCriterion[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || c.id.length === 0 || seen.has(c.id)) return null;
    if (typeof c.text !== 'string') return null;
    if (typeof c.points !== 'number' || !Number.isFinite(c.points) || c.points <= 0) return null;
    seen.add(c.id);
    out.push({ id: c.id, text: c.text, points: c.points });
  }
  return out;
}

/**
 * 체크한 기준으로 부분점수를 낸다.
 *
 * 결과의 `checkedIds`는 요청 순서가 아니라 **rubric 순서**로 정규화한다 — 저장된 값이
 * 화면 순서와 같아야 나중에 읽어 다시 그릴 때 체크 위치가 흔들리지 않는다.
 */
export function gradeByRubric(
  rubric: RubricCriterion[],
  checkedIds: readonly string[],
): RubricGradeResult {
  const requested = new Set(checkedIds);
  const known = new Set(rubric.map((c) => c.id));
  const unknownIds = [...requested].filter((id) => !known.has(id));

  const checked = rubric.filter((c) => requested.has(c.id));
  const earnedPoints = round2(checked.reduce((sum, c) => sum + c.points, 0));
  const totalPoints = round2(rubric.reduce((sum, c) => sum + c.points, 0));

  // 만점이 0이면 비율을 낼 수 없다. rubric 검증이 배점 > 0을 강제하므로 정상 경로에선
  // 나오지 않지만, 스냅샷은 소급 수정하지 않는 기록이라 옛 데이터를 방어한다.
  const isCorrect =
    totalPoints > 0 && earnedPoints / totalPoints + RATIO_EPSILON >= RUBRIC_PASS_RATIO;

  return {
    checkedIds: checked.map((c) => c.id),
    earnedPoints,
    totalPoints,
    isCorrect,
    unknownIds,
  };
}
