import {
  MASTER_CONSECUTIVE_CORRECT,
  REVIEW_INTERVAL_DAYS,
  REVIEW_STATUS,
  TRIANGLE_INTERVAL_LADDER_DAYS,
  transitionReviewState,
} from './review-state.util';

/**
 * 복습 상태 전이표(이슈 #15) 전수 검증.
 * 채점 트랜잭션 안에서 그대로 upsert되는 값이므로, 상태·연속정답·재노출 시각을 모두 못 박는다.
 */
describe('transitionReviewState', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;
  const afterDays = (d: number) => new Date(now.getTime() + d * DAY_MS);

  it('상수 sanity — X=1일, 세모 사다리=[3,7]일, 마스터=3연속(사다리 길이+1)', () => {
    expect(REVIEW_INTERVAL_DAYS.X).toBe(1);
    expect(TRIANGLE_INTERVAL_LADDER_DAYS).toEqual([3, 7]);
    expect(MASTER_CONSECUTIVE_CORRECT).toBe(TRIANGLE_INTERVAL_LADDER_DAYS.length + 1);
  });

  it('없음 + 정답 → O (1, null) — 처음부터 맞아 복습 대상 아님', () => {
    expect(transitionReviewState(null, true, now)).toEqual({
      status: REVIEW_STATUS.O,
      consecutiveCorrect: 1,
      nextReviewAt: null,
    });
  });

  it('없음 + 오답 → X (0, +1일)', () => {
    expect(transitionReviewState(null, false, now)).toEqual({
      status: REVIEW_STATUS.X,
      consecutiveCorrect: 0,
      nextReviewAt: afterDays(1),
    });
  });

  it('O + 정답 → O 유지 (연속정답 +1, null)', () => {
    expect(transitionReviewState({ status: 'O', consecutiveCorrect: 2 }, true, now)).toEqual({
      status: REVIEW_STATUS.O,
      consecutiveCorrect: 3,
      nextReviewAt: null,
    });
  });

  it('O + 오답 → X (0, +1일)', () => {
    expect(transitionReviewState({ status: 'O', consecutiveCorrect: 2 }, false, now)).toEqual({
      status: REVIEW_STATUS.X,
      consecutiveCorrect: 0,
      nextReviewAt: afterDays(1),
    });
  });

  it('X + 정답 → TRIANGLE (1, +3일) — 재도전 성공, 사다리 1단', () => {
    expect(transitionReviewState({ status: 'X', consecutiveCorrect: 0 }, true, now)).toEqual({
      status: REVIEW_STATUS.TRIANGLE,
      consecutiveCorrect: 1,
      nextReviewAt: afterDays(3),
    });
  });

  it('X + 오답 → X 유지 (0, +1일)', () => {
    expect(transitionReviewState({ status: 'X', consecutiveCorrect: 0 }, false, now)).toEqual({
      status: REVIEW_STATUS.X,
      consecutiveCorrect: 0,
      nextReviewAt: afterDays(1),
    });
  });

  it('TRIANGLE(1연속) + 정답 → TRIANGLE (2, +7일) — 사다리 2단, 아직 마스터 아님', () => {
    expect(transitionReviewState({ status: 'TRIANGLE', consecutiveCorrect: 1 }, true, now)).toEqual({
      status: REVIEW_STATUS.TRIANGLE,
      consecutiveCorrect: 2,
      nextReviewAt: afterDays(7),
    });
  });

  it('TRIANGLE(2연속) + 정답 → MASTERED (3, null) — 사다리를 다 오르면 복습 제외', () => {
    expect(transitionReviewState({ status: 'TRIANGLE', consecutiveCorrect: 2 }, true, now)).toEqual({
      status: REVIEW_STATUS.MASTERED,
      consecutiveCorrect: 3,
      nextReviewAt: null,
    });
  });

  it('TRIANGLE(연속정답 0 — 어긋난 구데이터) + 정답 → 사다리 2단으로 정상화', () => {
    expect(transitionReviewState({ status: 'TRIANGLE', consecutiveCorrect: 0 }, true, now)).toEqual({
      status: REVIEW_STATUS.TRIANGLE,
      consecutiveCorrect: 2,
      nextReviewAt: afterDays(7),
    });
  });

  it('TRIANGLE + 오답 → X (0, +1일)', () => {
    expect(transitionReviewState({ status: 'TRIANGLE', consecutiveCorrect: 1 }, false, now)).toEqual({
      status: REVIEW_STATUS.X,
      consecutiveCorrect: 0,
      nextReviewAt: afterDays(1),
    });
  });

  it('MASTERED + 정답 → MASTERED 유지 (연속정답 +1, null)', () => {
    expect(transitionReviewState({ status: 'MASTERED', consecutiveCorrect: 3 }, true, now)).toEqual({
      status: REVIEW_STATUS.MASTERED,
      consecutiveCorrect: 4,
      nextReviewAt: null,
    });
  });

  it('MASTERED + 오답 → X (0, +1일) — 마스터 리셋(이슈 #15 리셋 채택)', () => {
    expect(transitionReviewState({ status: 'MASTERED', consecutiveCorrect: 5 }, false, now)).toEqual({
      status: REVIEW_STATUS.X,
      consecutiveCorrect: 0,
      nextReviewAt: afterDays(1),
    });
  });

  it('알 수 없는 상태 문자열 + 정답 → O로 정상화 (DB VARCHAR 방어)', () => {
    expect(transitionReviewState({ status: 'WEIRD', consecutiveCorrect: 9 }, true, now)).toEqual({
      status: REVIEW_STATUS.O,
      consecutiveCorrect: 1,
      nextReviewAt: null,
    });
  });
});
