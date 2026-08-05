import type { RubricCriterion, RubricGrading } from './types';

/**
 * 채점기준표 읽기 유틸 — 화면이 Json 필드를 직접 파고들지 않도록 입구를 하나로 모은다.
 *
 * 점수 판정(몇 점부터 정답인가)은 여기 없다. 그건 서버 규칙이고
 * (`src/modules/exam-sessions/rubric-grading.util.ts`), 화면은 서버가 돌려준 값을 표시만 한다.
 * 여기서 계산하는 건 **체크하는 동안 보여줄 예상 점수**뿐이다.
 */

/**
 * 스냅샷/문항의 rubric 값을 기준 배열로 읽는다. 하나라도 형태가 어긋나면 null —
 * 서버 readRubric과 같은 기준이다(부분 수용하면 만점이 소리 없이 달라진다).
 */
export function readRubricCriteria(value: unknown): RubricCriterion[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: RubricCriterion[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id || seen.has(c.id)) return null;
    if (typeof c.text !== "string") return null;
    if (typeof c.points !== "number" || !Number.isFinite(c.points) || c.points <= 0) return null;
    seen.add(c.id);
    out.push({ id: c.id, text: c.text, points: c.points });
  }
  return out;
}

/** 답안 annotations에 저장된 부분점수 결과를 읽는다. 없거나 형태가 다르면 null. */
export function readRubricGrading(annotations: unknown): RubricGrading | null {
  if (!annotations || typeof annotations !== "object" || Array.isArray(annotations)) return null;
  const raw = (annotations as Record<string, unknown>).rubricGrading;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  if (!Array.isArray(g.checkedIds)) return null;
  if (typeof g.earnedPoints !== "number" || typeof g.totalPoints !== "number") return null;
  if (typeof g.isCorrect !== "boolean") return null;
  return {
    checkedIds: g.checkedIds.filter((id): id is string => typeof id === "string"),
    earnedPoints: g.earnedPoints,
    totalPoints: g.totalPoints,
    isCorrect: g.isCorrect,
  };
}

/**
 * 체크한 기준의 배점 합. 소수 2자리로 맞춘다 — 0.1 + 0.2가 0.30000000000000004로 보이면 안 된다.
 * 서버가 확정하는 점수와 같은 계산이지만, 확정 **전에** 보여주기 위한 미리보기다.
 */
export function sumRubricPoints(
  criteria: RubricCriterion[],
  checkedIds: ReadonlySet<string> | readonly string[],
): number {
  const checked = checkedIds instanceof Set ? checkedIds : new Set(checkedIds);
  const sum = criteria.reduce((acc, c) => (checked.has(c.id) ? acc + c.points : acc), 0);
  return Math.round(sum * 100) / 100;
}

/** 점수 표시용 — 정수는 정수로, 소수는 불필요한 0 없이. */
export function formatPoints(points: number): string {
  return String(Math.round(points * 100) / 100);
}
