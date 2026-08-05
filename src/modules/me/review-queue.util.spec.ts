import { buildReviewQueue, type ReviewQueueCandidate } from './review-queue.util';
import { REVIEW_STATUS } from '@/modules/exam-sessions/review-state.util';

const NOW = new Date('2026-08-05T00:00:00Z');
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

const row = (over: Partial<ReviewQueueCandidate> & { questionId: string }): ReviewQueueCandidate => ({
  status: REVIEW_STATUS.X,
  nextReviewAt: null,
  ...over,
});

const queue = (rows: ReviewQueueCandidate[], includeMastered = false) =>
  buildReviewQueue(rows, { includeMastered, now: NOW });

describe('buildReviewQueue — 포함 규칙', () => {
  it('복습 기록이 없는 오답은 포함한다 — 아직 한 번도 스케줄되지 않은 문항', () => {
    expect(queue([row({ questionId: 'q1', nextReviewAt: null })])).toEqual(['q1']);
  });

  it('예정일이 지난 X는 포함한다', () => {
    expect(queue([row({ questionId: 'q1', nextReviewAt: daysFromNow(-1) })])).toEqual(['q1']);
  });

  it('예정일이 아직 안 온 X는 제외한다 — 즉시 재출제하면 간격 스케줄이 무력화된다', () => {
    expect(queue([row({ questionId: 'q1', nextReviewAt: daysFromNow(1) })])).toEqual([]);
  });

  it('예정일이 정확히 지금이면 포함한다(경계 포함)', () => {
    expect(queue([row({ questionId: 'q1', nextReviewAt: NOW })])).toEqual(['q1']);
  });

  it('세모(TRIANGLE)도 같은 규칙을 따른다', () => {
    const rows = [
      row({ questionId: 'due', status: REVIEW_STATUS.TRIANGLE, nextReviewAt: daysFromNow(-1) }),
      row({ questionId: 'later', status: REVIEW_STATUS.TRIANGLE, nextReviewAt: daysFromNow(2) }),
    ];
    expect(queue(rows)).toEqual(['due']);
  });

  it('O(처음부터 맞음)는 복습 대상이 아니다', () => {
    const rows = [row({ questionId: 'q1', status: REVIEW_STATUS.O, nextReviewAt: null })];
    expect(queue(rows)).toEqual([]);
  });

  it('마스터는 기본 제외, 토글을 켜면 포함', () => {
    const rows = [row({ questionId: 'q1', status: REVIEW_STATUS.MASTERED, nextReviewAt: null })];
    expect(queue(rows)).toEqual([]);
    expect(queue(rows, true)).toEqual(['q1']);
  });

  it('같은 문항이 두 번 와도 한 번만 담는다', () => {
    const rows = [row({ questionId: 'q1' }), row({ questionId: 'q1' })];
    expect(queue(rows)).toEqual(['q1']);
  });
});

describe('buildReviewQueue — 정렬', () => {
  it('예정일 도래분이 기록 없음보다 먼저다', () => {
    const rows = [
      row({ questionId: 'unscheduled', nextReviewAt: null }),
      row({ questionId: 'due', nextReviewAt: daysFromNow(-1) }),
    ];
    expect(queue(rows)).toEqual(['due', 'unscheduled']);
  });

  it('도래분끼리는 오래 밀린 순', () => {
    const rows = [
      row({ questionId: 'recent', nextReviewAt: daysFromNow(-1) }),
      row({ questionId: 'stale', nextReviewAt: daysFromNow(-30) }),
    ];
    expect(queue(rows)).toEqual(['stale', 'recent']);
  });

  it('마스터는 가장 뒤 — 켜도 급한 것을 밀어내지 않는다', () => {
    const rows = [
      row({ questionId: 'mastered', status: REVIEW_STATUS.MASTERED }),
      row({ questionId: 'unscheduled', nextReviewAt: null }),
      row({ questionId: 'due', nextReviewAt: daysFromNow(-1) }),
    ];
    expect(queue(rows, true)).toEqual(['due', 'unscheduled', 'mastered']);
  });
});
