import { snapshotPassages, QuestionSnapshot } from './grading.util';

const snap = (over: Partial<QuestionSnapshot>): QuestionSnapshot =>
  ({ questionType: '객관식', stem: {} as never, points: 1, difficulty: 3, ...over }) as QuestionSnapshot;

const doc = (text: string) =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }) as never;

describe('snapshotPassages — 신·구 스냅샷 형태 동시 지원', () => {
  it('지문이 없으면 빈 배열', () => {
    expect(snapshotPassages(snap({}))).toEqual([]);
  });

  it('신형 세트는 순서와 라벨을 그대로 넘긴다', () => {
    const passages = [
      { content: doc('가 지문'), label: '(가)' },
      { content: doc('나 지문'), label: '(나)' },
    ];
    expect(snapshotPassages(snap({ passages }))).toEqual(passages);
  });

  it('구형 단수 passage도 읽는다 — 이미 DB에 박힌 스냅샷은 소급 수정하지 않는다', () => {
    const passage = doc('예전 지문');
    expect(snapshotPassages(snap({ passage }))).toEqual([{ content: passage }]);
  });

  it('둘 다 있으면 신형이 이긴다', () => {
    const passages = [{ content: doc('신형') }];
    expect(snapshotPassages(snap({ passages, passage: doc('구형') }))).toEqual(passages);
  });

  it('신형이 빈 배열이면 구형으로 물러난다 — 빈 세트가 지문을 삼키면 안 된다', () => {
    const passage = doc('구형');
    expect(snapshotPassages(snap({ passages: [], passage }))).toEqual([{ content: passage }]);
  });
});
