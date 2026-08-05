import { RubricCriterion } from '@/common/constants/rubric';
import { gradeByRubric, readRubric, RUBRIC_PASS_RATIO } from './rubric-grading.util';

const rubric = (points: number[]): RubricCriterion[] =>
  points.map((p, i) => ({ id: `c${i + 1}`, text: `기준 ${i + 1}`, points: p }));

describe('readRubric — 스냅샷/Json 컬럼 읽기', () => {
  it('정상 배열은 그대로 읽는다', () => {
    expect(readRubric([{ id: 'c1', text: '핵심어 포함', points: 3 }])).toEqual([
      { id: 'c1', text: '핵심어 포함', points: 3 },
    ]);
  });

  it('없음/빈 배열은 null — 기존 정오 2지선다 자기채점으로 되돌아간다', () => {
    expect(readRubric(undefined)).toBeNull();
    expect(readRubric(null)).toBeNull();
    expect(readRubric([])).toBeNull();
  });

  it('기준 하나만 깨져도 통째로 null (부분 수용하면 만점이 소리 없이 달라진다)', () => {
    expect(readRubric([{ id: 'c1', text: 'ok', points: 3 }, { id: 'c2', text: 'ok' }])).toBeNull();
    expect(readRubric([{ id: 'c1', text: 'ok', points: 0 }])).toBeNull();
    expect(readRubric([{ id: 'c1', text: 'ok', points: -1 }])).toBeNull();
    expect(readRubric([{ id: '', text: 'ok', points: 1 }])).toBeNull();
    expect(readRubric(['c1'])).toBeNull();
    expect(readRubric({ c1: 3 })).toBeNull();
  });

  it('중복 id면 null — 체크 기록을 기준으로 되돌릴 수 없다', () => {
    expect(
      readRubric([
        { id: 'c1', text: 'a', points: 1 },
        { id: 'c1', text: 'b', points: 2 },
      ]),
    ).toBeNull();
  });
});

describe('gradeByRubric — 부분점수 계산', () => {
  it('체크한 기준의 배점만 더한다', () => {
    const r = gradeByRubric(rubric([2, 3, 5]), ['c1', 'c3']);
    expect(r.earnedPoints).toBe(7);
    expect(r.totalPoints).toBe(10);
  });

  it('아무것도 체크하지 않으면 0점', () => {
    const r = gradeByRubric(rubric([2, 3, 5]), []);
    expect(r.earnedPoints).toBe(0);
    expect(r.isCorrect).toBe(false);
  });

  it('중복 체크를 두 번 세지 않는다', () => {
    expect(gradeByRubric(rubric([2, 3]), ['c1', 'c1', 'c1']).earnedPoints).toBe(2);
  });

  it('checkedIds를 rubric 순서로 정규화한다(저장 값이 화면 순서와 같아야 한다)', () => {
    expect(gradeByRubric(rubric([1, 1, 1]), ['c3', 'c1']).checkedIds).toEqual(['c1', 'c3']);
  });

  it('rubric에 없는 id는 점수에 넣지 않고 unknownIds로 알린다', () => {
    const r = gradeByRubric(rubric([2, 3]), ['c1', 'c9']);
    expect(r.earnedPoints).toBe(2);
    expect(r.unknownIds).toEqual(['c9']);
  });

  it('소수 배점의 합이 부동소수 오차로 흔들리지 않는다', () => {
    expect(gradeByRubric(rubric([0.1, 0.2]), ['c1', 'c2']).earnedPoints).toBe(0.3);
  });
});

/**
 * 부분점수 → isCorrect 접기. 이 경계가 정답률 캐시·복습 상태 전이·XP의 입력이 되므로
 * 규칙을 테스트로 못박는다(기준선: 만점의 60%).
 */
describe('gradeByRubric — isCorrect 판정 경계', () => {
  it('기준선이 60%다', () => {
    expect(RUBRIC_PASS_RATIO).toBe(0.6);
  });

  it('정확히 60%면 정답(경계 포함)', () => {
    expect(gradeByRubric(rubric([6, 4]), ['c1']).isCorrect).toBe(true);
  });

  it('60% 바로 아래면 오답', () => {
    // 5.9 / 10 = 59%
    expect(gradeByRubric(rubric([5.9, 4.1]), ['c1']).isCorrect).toBe(false);
  });

  it('소수 배점에서도 딱 60%면 정답 (부동소수 오차로 밀리지 않는다)', () => {
    // 2.4 / 4 = 0.6 — 이진 부동소수로 정확히 떨어지지 않는 비율
    expect(gradeByRubric(rubric([2.4, 1.6]), ['c1']).isCorrect).toBe(true);
  });

  it('기준 하나만 맞은 답안은 정답이 아니다 (복습 대상에서 빠지지 않게)', () => {
    expect(gradeByRubric(rubric([2, 2, 2, 2, 2, 2]), ['c1']).isCorrect).toBe(false);
  });

  it('만점이면 당연히 정답', () => {
    expect(gradeByRubric(rubric([2, 3, 5]), ['c1', 'c2', 'c3']).isCorrect).toBe(true);
  });

  it('만점이 0인 손상 데이터는 오답으로 떨어뜨린다(0으로 나누지 않는다)', () => {
    const r = gradeByRubric([{ id: 'c1', text: 'x', points: 0 }], ['c1']);
    expect(r.isCorrect).toBe(false);
  });
});
