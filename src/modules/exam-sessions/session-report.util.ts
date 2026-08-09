/**
 * 세션 결과 축별 리포트(벤치마킹: 산타·매쓰플랫의 응시 직후 취약 유형 분석).
 *
 * 오답노트(/me/notes)의 전 기간 누적 축과 달리 **방금 제출한 세션 하나**가 모집단이다 —
 * "이번 시험에서 어느 축에서 잃었나"는 누적 통계로는 답할 수 없던 질문이다.
 *
 * 순수 함수로 둔다: 집계 대상(채점 결과)과 문항 메타(하위요소·키워드)를 받아 접기만 한다.
 * DB 조회는 서비스가 한다 — 여기가 조회까지 하면 스냅샷/실문항 어느 쪽을 믿는지가 흐려진다.
 */

export interface AxisReportItem {
  questionId: string;
  /** 스냅샷의 난이도 — 응시 시점 기준(이후 원본 수정과 무관, 스냅샷 원칙). */
  difficulty: number;
  /** 채점 결과. null = 미채점(미응답·서술형 자기채점 전) — 정오 어느 쪽으로도 세지 않는다. */
  isCorrect: boolean | null;
}

/** 문항 메타 — 실문항 조인 결과. 문항이 삭제됐으면 항목 자체가 없다(스냅샷엔 축 정보가 없다). */
export interface AxisReportQuestionMeta {
  detail?: { id: string; name: string } | null;
  keywords?: { id: string; name: string }[];
}

export interface AxisBucket {
  key: string;
  label: string;
  total: number;
  correct: number;
}

export interface SessionAxisReport {
  /** 채점된 문항 수(집계 모집단). */
  graded: number;
  /** 미채점 문항 수 — 0이 아니면 화면이 "아직 전부 채점되지 않았다"를 알려야 한다. */
  ungraded: number;
  byDifficulty: { difficulty: number; total: number; correct: number }[];
  /** #키워드(개념) 축 — 오답 많은 순, 상한 KEYWORD_AXIS_CAP. */
  byKeyword: AxisBucket[];
  /** 하위요소(4단계) 축 — 오답 많은 순. 하위요소가 없는 문항은 축에 잡히지 않는다. */
  bySubjectDetail: AxisBucket[];
}

/** 키워드 축 상한 — 한 세션에서 이보다 많으면 화면이 표가 아니라 벽이 된다. */
export const KEYWORD_AXIS_CAP = 12;

/** 오답 많은 순 → 표본 큰 순 → 이름순. "어디서 잃었나"가 목적이므로 오답이 먼저다. */
function byLoss(a: AxisBucket, b: AxisBucket): number {
  const lossDiff = b.total - b.correct - (a.total - a.correct);
  if (lossDiff !== 0) return lossDiff;
  if (b.total !== a.total) return b.total - a.total;
  return a.label.localeCompare(b.label, 'ko');
}

export function buildSessionAxisReport(
  items: AxisReportItem[],
  metaByQuestion: Map<string, AxisReportQuestionMeta>,
): SessionAxisReport {
  const graded = items.filter((i) => i.isCorrect !== null);
  const difficulty = new Map<number, { total: number; correct: number }>();
  const keyword = new Map<string, AxisBucket>();
  const detail = new Map<string, AxisBucket>();

  for (const item of graded) {
    const correct = item.isCorrect === true ? 1 : 0;

    const d = difficulty.get(item.difficulty) ?? { total: 0, correct: 0 };
    d.total += 1;
    d.correct += correct;
    difficulty.set(item.difficulty, d);

    const meta = metaByQuestion.get(item.questionId);
    if (!meta) continue; // 원본 문항이 삭제된 경우 — 난이도 축(스냅샷 출처)에만 잡힌다.

    if (meta.detail) {
      const bucket = detail.get(meta.detail.id) ?? {
        key: meta.detail.id,
        label: meta.detail.name,
        total: 0,
        correct: 0,
      };
      bucket.total += 1;
      bucket.correct += correct;
      detail.set(meta.detail.id, bucket);
    }
    for (const kw of meta.keywords ?? []) {
      const bucket = keyword.get(kw.id) ?? { key: kw.id, label: kw.name, total: 0, correct: 0 };
      bucket.total += 1;
      bucket.correct += correct;
      keyword.set(kw.id, bucket);
    }
  }

  return {
    graded: graded.length,
    ungraded: items.length - graded.length,
    byDifficulty: Array.from(difficulty.entries())
      .map(([level, v]) => ({ difficulty: level, ...v }))
      .sort((a, b) => a.difficulty - b.difficulty),
    byKeyword: Array.from(keyword.values()).sort(byLoss).slice(0, KEYWORD_AXIS_CAP),
    bySubjectDetail: Array.from(detail.values()).sort(byLoss),
  };
}
