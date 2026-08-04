/**
 * 약점 진단 점수 계산 (#37).
 *
 * 순수 함수만 둔다 — 서비스가 이미 모아 놓은 집계를 받아 순위를 매길 뿐 DB를 모른다.
 * 진단 규칙(표본 하한·점수식·처방 분류)은 **코치의 판단**이라 테스트로 고정돼야 하고,
 * 프런트에 흩뿌리면 화면마다 다른 진단이 나온다.
 *
 * 신호의 신뢰도 전제: 통계가 1차 응시만 집계한다(#39 B-1). 복습 재풀이가 섞여 있으면
 * "틀린 문제만 다시 푼다"는 복습의 정의 때문에 정답률이 실력과 무관하게 내려간다.
 */
import { ReasonCode, REASON_LABELS } from '@/common/constants/question';

/**
 * 진단에 필요한 최소 표본. 이보다 적으면 순위에 넣지 않는다.
 *
 * 3문항 중 2개 틀렸다고 "이게 네 약점"이라 말하는 건 코치로서 오진이다.
 * 소표본은 버리지 않고 `needsMoreData`로 따로 돌려줘서 화면이 "더 풀어보세요"로
 * 안내할 수 있게 한다 — 표본 부족과 약점 없음은 다른 상태다.
 */
export const WEAKNESS_MIN_SAMPLE = 5;

/** 처방이 갈리는 지점 — 이 축의 오답 원인 중 '실수' 비중이 이 값 이상이면 훈련 부족으로 본다. */
export const DRILL_REASON_RATIO = 0.5;

/** 약점의 성격. 처방이 다르므로 라벨을 나눈다. */
export type WeaknessKind = 'CONCEPT' | 'DRILL';

export interface WeaknessStatInput {
  key: string;
  label: string;
  /** 채점된 답안 수(표본). */
  total: number;
  /** 틀린 수. */
  wrong: number;
}

export interface Weakness {
  key: string;
  label: string;
  total: number;
  wrong: number;
  /** 정답률(%) — 표본과 함께 보여줘야 오해가 없다. */
  accuracyPercent: number;
  /** 정렬 점수. 값 자체는 의미가 없고 축끼리의 상대 비교용이다. */
  score: number;
  /**
   * CONCEPT = 개념 약점(다시 배워야 함), DRILL = 훈련 부족(알지만 실수).
   * 처방이 갈린다 — 개념은 해설·튜터, 훈련은 반복 풀이.
   */
  kind: WeaknessKind;
  /** 이 축에서 가장 많이 찍힌 오답 원인(있을 때만). */
  dominantReason: { code: string; label: string; count: number } | null;
}

export interface WeaknessReport {
  /** 점수 높은 순. 표본 하한을 넘긴 축만. */
  weaknesses: Weakness[];
  /** 표본이 부족해 판정을 보류한 축 — "더 풀어보세요" 안내용. */
  needsMoreData: { key: string; label: string; total: number }[];
}

/**
 * 약점 점수 = (1 - 정답률) × log(1 + 표본수).
 *
 * 오답률만 쓰면 "2문항 중 2개 틀림"이 1위가 되고, 표본수만 쓰면 많이 푼 축이 늘 위로 온다.
 * 로그를 씌우는 이유는 표본이 커질수록 추가 표본의 기여를 줄이기 위해서다 —
 * 100문항 축이 20문항 축을 표본만으로 눌러버리면 순위가 "많이 푼 순"이 된다.
 */
export function weaknessScore(total: number, wrong: number): number {
  if (total <= 0) return 0;
  const wrongRatio = wrong / total;
  return wrongRatio * Math.log(1 + total);
}

/**
 * 축별 통계와 (선택) 축별 오답 원인 분포로 약점 순위를 만든다.
 *
 * @param stats        분류축 통계(bySubjectDetail 등)
 * @param reasonsByKey 축 key → { reasonCode: count }. 없으면 전부 CONCEPT으로 본다.
 * @param limit        상위 몇 개까지 돌려줄지
 */
export function rankWeaknesses(
  stats: WeaknessStatInput[],
  reasonsByKey: Map<string, Map<string, number>> = new Map(),
  limit = 3,
): WeaknessReport {
  const needsMoreData: WeaknessReport['needsMoreData'] = [];
  const scored: Weakness[] = [];

  for (const stat of stats) {
    if (stat.total <= 0) continue;

    if (stat.total < WEAKNESS_MIN_SAMPLE) {
      // 표본 부족 — 순위에 넣지 않는다. 단 "틀린 적이 있는" 축만 안내 대상으로 삼는다.
      // 다 맞힌 소표본 축까지 "더 풀어보세요"로 띄우면 안내가 소음이 된다.
      if (stat.wrong > 0) {
        needsMoreData.push({ key: stat.key, label: stat.label, total: stat.total });
      }
      continue;
    }

    // 다 맞힌 축은 약점이 아니다.
    if (stat.wrong === 0) continue;

    const reasons = reasonsByKey.get(stat.key);
    scored.push({
      key: stat.key,
      label: stat.label,
      total: stat.total,
      wrong: stat.wrong,
      accuracyPercent: Math.round(((stat.total - stat.wrong) / stat.total) * 1000) / 10,
      score: weaknessScore(stat.total, stat.wrong),
      kind: classifyKind(reasons),
      dominantReason: dominantReasonOf(reasons),
    });
  }

  scored.sort((a, b) => b.score - a.score || b.wrong - a.wrong);
  return { weaknesses: scored.slice(0, limit), needsMoreData };
}

/**
 * '실수'가 절반 이상이면 훈련 부족(DRILL)으로 본다.
 * 개념을 다시 가르치는 처방과 반복해서 손에 익히는 처방은 다르므로 섞으면 안 된다.
 * 원인 기록이 없으면 판단 근거가 없으니 기본값 CONCEPT.
 */
function classifyKind(reasons: Map<string, number> | undefined): WeaknessKind {
  if (!reasons || reasons.size === 0) return 'CONCEPT';
  let mistake = 0;
  let all = 0;
  for (const [code, count] of reasons) {
    all += count;
    if (code === ('MISTAKE' satisfies ReasonCode)) mistake += count;
  }
  if (all === 0) return 'CONCEPT';
  return mistake / all >= DRILL_REASON_RATIO ? 'DRILL' : 'CONCEPT';
}

function dominantReasonOf(reasons: Map<string, number> | undefined): Weakness['dominantReason'] {
  if (!reasons || reasons.size === 0) return null;
  let best: { code: string; count: number } | null = null;
  for (const [code, count] of reasons) {
    if (!best || count > best.count) best = { code, count };
  }
  if (!best) return null;
  return {
    code: best.code,
    label: REASON_LABELS[best.code as ReasonCode] ?? best.code,
    count: best.count,
  };
}
