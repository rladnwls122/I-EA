/**
 * 복습 큐 조립 규칙 — 순수 함수.
 *
 * 이 규칙은 원래 **프런트에** 있었다(`app/notes/@sidebar/page.tsx`). 화면이 `/me/notes`로
 * 채점 이력 전량을 받아 거기서 큐를 조립했는데, 그 응답은 상한 500에 잘린다(#39 B-3).
 * 즉 오래 푼 사용자일수록 **복습해야 할 문항이 큐에서 조용히 빠졌다** — 응답에 `truncated`를
 * 실어 경고는 했지만, 경고는 누락을 고치지 못한다.
 *
 * 큐가 봐야 하는 건 채점 이력이 아니라 복습 상태다. 상태 테이블을 직접 읽으면
 * 상한과 무관하게 정확하고, 페이지네이션도 자연스럽게 풀린다(#39 B-3이 재설계와 함께
 * 하자고 미뤄 둔 그 지점). due 배지(`/me/review-summary`)와도 데이터 출처가 하나가 된다.
 *
 * 여기에는 **어떤 문항이 어떤 순서로 큐에 들어가는가**만 둔다. 조회·필터는 서비스 몫이다.
 */
import { REVIEW_STATUS } from '@/modules/exam-sessions/review-state.util';

/** 큐 판정에 필요한 복습 상태의 최소 형태(DB 행에서 발췌). */
export interface ReviewQueueCandidate {
  questionId: string;
  status: string;
  nextReviewAt: Date | null;
}

/**
 * 큐 진입 우선순위. 낮을수록 급하다.
 *   0 = 재노출 예정일이 지난 것(오래 밀린 순)
 *   1 = 복습 기록이 없는 오답(아직 한 번도 스케줄되지 않음)
 *   2 = 마스터(토글을 켰을 때만)
 */
const RANK_DUE = 0;
const RANK_UNSCHEDULED = 1;
const RANK_MASTERED = 2;

export interface QueueOptions {
  /** 마스터(복습 졸업) 문항을 포함할지. 기본 제외 — 이슈 #21 결정. */
  includeMastered: boolean;
  now: Date;
}

/**
 * 복습 큐를 급한 순으로 정렬해 문항 id를 돌려준다.
 *
 * 포함 규칙:
 *   - 기록 없음: 포함. 아직 스케줄되지 않은 오답이다.
 *   - X / 세모: **예정일이 도래한 것만.** 방금 틀린 문항을 즉시 재출제하면
 *     간격 스케줄(X=1일 · 세모=3→7일 누진)이 무력화된다.
 *   - 마스터: 토글이 켜졌을 때만.
 *   - O(처음부터 맞음): 제외. 복습 대상이 아니다.
 */
export function buildReviewQueue(
  candidates: ReviewQueueCandidate[],
  opts: QueueOptions,
): string[] {
  const now = opts.now.getTime();
  const seen = new Set<string>();
  const rows: { questionId: string; rank: number; dueAt: number }[] = [];

  for (const c of candidates) {
    // 같은 문항이 두 번 들어오면 첫 행만 남긴다(방어 — 상태는 유저×문항 UNIQUE다).
    if (seen.has(c.questionId)) continue;
    seen.add(c.questionId);

    if (c.status === REVIEW_STATUS.MASTERED) {
      if (opts.includeMastered) {
        rows.push({ questionId: c.questionId, rank: RANK_MASTERED, dueAt: 0 });
      }
      continue;
    }
    if (c.status === REVIEW_STATUS.O) continue;

    if (c.nextReviewAt == null) {
      rows.push({ questionId: c.questionId, rank: RANK_UNSCHEDULED, dueAt: 0 });
      continue;
    }
    const dueAt = c.nextReviewAt.getTime();
    if (dueAt <= now) rows.push({ questionId: c.questionId, rank: RANK_DUE, dueAt });
  }

  // 급한 순 → 같은 급이면 오래 밀린 순.
  rows.sort((a, b) => a.rank - b.rank || a.dueAt - b.dueAt);
  return rows.map((r) => r.questionId);
}
