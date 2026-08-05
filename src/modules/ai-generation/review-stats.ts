import { REVIEW_AXES, ReviewAxis } from './llm/llm.types';

/**
 * 자기검증 판정 집계(#33 잔여 1).
 *
 * 헤드라인(PASS/REVISE/ERROR 비율)은 **DB가 센다** — 상한 없이 정확해야 하는 숫자이고
 * `questions.review_verdict` 컬럼을 꺼낸 이유가 그것이다. 이 파일이 맡는 건
 * **컬럼으로 못 꺼내는 것**뿐이다: 어느 축이 자주 걸리는가(축은 `metadata.review.axes`
 * 안에 있어 SQL로 못 묶는다), 회차(일자)별로 어떻게 변하는가.
 *
 * 축별 서술형 득점률과 같은 선택이다 — raw SQL로 조건을 한 벌 더 적으면 언젠가 한쪽만
 * 고쳐지므로, 행을 상한 걸어 받아 앱에서 접는다.
 */

/** 축 분해·일자별 추이가 읽는 행 수 상한. 헤드라인은 이 상한 밖에서 정확하다. */
export const REVIEW_STATS_ROW_CAP = 2000;

export interface ReviewStatsRow {
  createdAt: Date;
  reviewVerdict: string | null;
  metadata: unknown;
}

export interface ReviewAxisCount {
  axis: ReviewAxis;
  /** 이 축이 지적된 문항 수. */
  count: number;
}

export interface ReviewDayCount {
  /** `YYYY-MM-DD` (서버 로컬 기준 — `npm run quality:generation` 회차와 대조하는 축이다). */
  date: string;
  pass: number;
  revise: number;
  error: number;
}

export interface ReviewStatsBreakdown {
  byAxis: ReviewAxisCount[];
  byDay: ReviewDayCount[];
  /** 접는 데 실제로 쓴 행 수. 상한에 닿았는지를 화면이 알아야 "전부"라고 읽지 않는다. */
  sampled: number;
  capped: boolean;
}

/**
 * 판정이 남은 문항 행들을 축·일자로 접는다.
 *
 * - 축은 **REVISE에만** 센다. PASS 판정에 축이 딸려 오는 경우는 모델의 실수이고,
 *   그걸 세면 "자주 걸리는 축"이 통과 사유로 오염된다.
 * - 모르는 축 문자열은 버린다. 프롬프트가 흔들려 새 문자열이 나와도 통계 축은 코드가 정한다
 *   (`REVIEW_AXES`를 고정한 이유 그대로).
 * - 같은 문항에서 같은 축이 두 번 나와도 한 번만 센다 — 문항 수를 세는 지표다.
 * - 일자는 **최신이 앞**이다. 추이를 볼 때 먼저 궁금한 쪽이 최근이다.
 */
export function foldReviewRows(rows: ReviewStatsRow[]): ReviewStatsBreakdown {
  const axisCounts = new Map<ReviewAxis, number>();
  const dayCounts = new Map<string, ReviewDayCount>();

  for (const row of rows) {
    const date = toLocalDate(row.createdAt);
    const day = dayCounts.get(date) ?? { date, pass: 0, revise: 0, error: 0 };
    if (row.reviewVerdict === 'PASS') day.pass += 1;
    else if (row.reviewVerdict === 'REVISE') day.revise += 1;
    else if (row.reviewVerdict === 'ERROR') day.error += 1;
    dayCounts.set(date, day);

    if (row.reviewVerdict !== 'REVISE') continue;
    for (const axis of readAxes(row.metadata)) {
      axisCounts.set(axis, (axisCounts.get(axis) ?? 0) + 1);
    }
  }

  return {
    // 많이 걸린 축부터 — 첫 줄이 곧 프롬프트를 다음에 손볼 자리다.
    byAxis: [...axisCounts.entries()]
      .map(([axis, count]) => ({ axis, count }))
      .sort((a, b) => b.count - a.count || a.axis.localeCompare(b.axis)),
    byDay: [...dayCounts.values()].sort((a, b) => b.date.localeCompare(a.date)),
    sampled: rows.length,
    capped: rows.length >= REVIEW_STATS_ROW_CAP,
  };
}

/** `metadata.review.axes`에서 아는 축만, 중복 없이. */
function readAxes(metadata: unknown): ReviewAxis[] {
  if (typeof metadata !== 'object' || metadata === null) return [];
  const review = (metadata as Record<string, unknown>).review;
  if (typeof review !== 'object' || review === null) return [];
  const axes = (review as Record<string, unknown>).axes;
  if (!Array.isArray(axes)) return [];
  const known = new Set<ReviewAxis>();
  for (const a of axes) {
    if (typeof a === 'string' && (REVIEW_AXES as readonly string[]).includes(a)) {
      known.add(a as ReviewAxis);
    }
  }
  return [...known];
}

/** `toISOString()`을 쓰지 않는다 — UTC로 자르면 새벽에 만든 문항이 전날로 밀린다. */
function toLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
