import { describe, it, expect } from 'vitest';
import {
  formatPoints,
  readRubricCriteria,
  readRubricGrading,
  sumRubricPoints,
} from './rubric';

const RUBRIC = [
  { id: 'c1', text: '핵심어 포함', points: 6 },
  { id: 'c2', text: '근거 제시', points: 4 },
];

describe('readRubricCriteria — 스냅샷/문항의 rubric 읽기', () => {
  it('정상 배열은 그대로 읽는다', () => {
    expect(readRubricCriteria(RUBRIC)).toEqual(RUBRIC);
  });

  it('없음/빈 배열은 null — 화면이 기존 맞음/틀림 두 버튼으로 되돌아간다', () => {
    expect(readRubricCriteria(undefined)).toBeNull();
    expect(readRubricCriteria(null)).toBeNull();
    expect(readRubricCriteria([])).toBeNull();
  });

  it('하나라도 형태가 어긋나면 통째로 null (서버 readRubric과 같은 기준)', () => {
    expect(readRubricCriteria([{ id: 'c1', text: 'x' }])).toBeNull();
    expect(readRubricCriteria([{ id: 'c1', text: 'x', points: 0 }])).toBeNull();
    expect(readRubricCriteria([{ id: 'c1', text: 'x', points: '3' }])).toBeNull();
    expect(
      readRubricCriteria([
        { id: 'c1', text: 'a', points: 1 },
        { id: 'c1', text: 'b', points: 1 },
      ]),
    ).toBeNull();
  });
});

describe('readRubricGrading — 답안에 저장된 채점 결과 읽기', () => {
  it('annotations의 예약 키에서 읽는다', () => {
    const grading = { checkedIds: ['c1'], earnedPoints: 6, totalPoints: 10, isCorrect: true };
    expect(readRubricGrading({ strokes: [], rubricGrading: grading })).toEqual(grading);
  });

  it('필기만 있는 답안은 null (기존 답안이 그렇다)', () => {
    expect(readRubricGrading({ strokes: [1, 2] })).toBeNull();
    expect(readRubricGrading(null)).toBeNull();
    expect(readRubricGrading([])).toBeNull();
  });

  it('형태가 어긋난 값은 null — 점수 자리에 아무거나 그리지 않는다', () => {
    expect(readRubricGrading({ rubricGrading: { checkedIds: ['c1'] } })).toBeNull();
    expect(
      readRubricGrading({ rubricGrading: { checkedIds: 'c1', earnedPoints: 1, totalPoints: 2, isCorrect: true } }),
    ).toBeNull();
  });
});

describe('sumRubricPoints — 체크 중 미리보기 점수', () => {
  it('체크한 기준의 배점만 더한다', () => {
    expect(sumRubricPoints(RUBRIC, ['c1'])).toBe(6);
    expect(sumRubricPoints(RUBRIC, ['c1', 'c2'])).toBe(10);
    expect(sumRubricPoints(RUBRIC, [])).toBe(0);
  });

  it('모르는 id는 무시한다', () => {
    expect(sumRubricPoints(RUBRIC, ['c9'])).toBe(0);
  });

  it('소수 배점이 부동소수 오차로 흔들리지 않는다', () => {
    const r = [
      { id: 'c1', text: 'a', points: 0.1 },
      { id: 'c2', text: 'b', points: 0.2 },
    ];
    expect(sumRubricPoints(r, ['c1', 'c2'])).toBe(0.3);
  });
});

describe('formatPoints', () => {
  it('정수는 정수로, 소수는 불필요한 0 없이', () => {
    expect(formatPoints(3)).toBe('3');
    expect(formatPoints(2.5)).toBe('2.5');
    expect(formatPoints(0.30000000000000004)).toBe('0.3');
  });
});
