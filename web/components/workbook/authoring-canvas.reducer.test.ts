import { describe, it, expect } from 'vitest';
import {
  canvasReducer,
  initialCanvasState,
  sharedWith,
  type CanvasState,
} from './authoring-canvas.reducer';
import { emptyBaseline } from './authoring-save-run';
import { buildRichDoc } from '@/lib/prosemirror-assemble';
import type { CanvasCard } from './AuthoringCanvas';

/** id·그룹 없는 카드 내용 — 그 둘은 리듀서가 정한다. */
const content = (
  over: Partial<CanvasCard> = {},
): Omit<CanvasCard, 'id' | 'passageGroupId'> => ({
  type: '객관식',
  stem: buildRichDoc('발문'),
  passage: null,
  choices: [
    { text: '선지1', explanation: '', showExplanation: false },
    { text: '선지2', explanation: '', showExplanation: false },
  ],
  correct: 1,
  answerText: '',
  explanation: buildRichDoc(''),
  points: 1,
  keywords: [],
  ...over,
});

const card = (over: Partial<CanvasCard> = {}): CanvasCard => ({
  id: 'q-1',
  passageGroupId: null,
  ...content(over),
  ...(over.id ? { id: over.id } : {}),
  ...(over.passageGroupId !== undefined ? { passageGroupId: over.passageGroupId } : {}),
});

const run = (state: CanvasState, ...actions: Parameters<typeof canvasReducer>[1][]) =>
  actions.reduce(canvasReducer, state);

describe('하이드레이션', () => {
  const base = initialCanvasState();

  it('복원한 문항과 기준선을 함께 세운다', () => {
    const cards = [card({ id: 'q-1' })];
    const next = canvasReducer(base, {
      type: 'hydrateQuestions',
      cards,
      baseline: { ...emptyBaseline(), questions: { 'q-1': 'fp' } },
    });
    expect(next.cards).toEqual(cards);
    expect(next.questionsHydrated).toBe(true);
    expect(next.baseline.questions['q-1']).toBe('fp');
  });

  it('사용자가 이미 카드를 넣었으면 복원이 덮어쓰지 않는다', () => {
    const withUserCard = canvasReducer(base, {
      type: 'addManualCard',
      card: content(),
      now: 1,
    });
    const next = canvasReducer(withUserCard, {
      type: 'hydrateQuestions',
      cards: [card({ id: 'q-server' })],
      baseline: emptyBaseline(),
    });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0].id).not.toBe('q-server');
    expect(next.questionsHydrated).toBe(true); // 그래도 복원 시도는 끝났다
  });

  it('메타 복원은 한 번만 — 두 번째 호출은 사용자가 바꾼 값을 되돌리지 않는다', () => {
    const first = canvasReducer(base, { type: 'hydrateMeta', keywords: ['수능'], isPublic: true });
    const userToggled = canvasReducer(first, { type: 'setPublic', isPublic: false });
    const second = canvasReducer(userToggled, {
      type: 'hydrateMeta',
      keywords: ['수능'],
      isPublic: true,
    });
    expect(second.isPublic).toBe(false);
  });
});

describe('지문 그룹 — 유입', () => {
  const base = initialCanvasState();

  it('같은 AI 응답에서 지문이 같은 문항들은 한 세트로 묶인다', () => {
    const passage = buildRichDoc('(가) 지문');
    const next = run(
      base,
      { type: 'applyAiQuestion', card: content({ passage }), target: 'new', originKey: 'msg-1', now: 1 },
      { type: 'applyAiQuestion', card: content({ passage }), target: 'new', originKey: 'msg-1', now: 1 },
    );
    expect(next.cards[0].passageGroupId).toBe(next.cards[1].passageGroupId);
    expect(next.cards[0].passageGroupId).toBeTruthy();
  });

  it('응답이 다르면 지문 평문이 같아도 남남이다 — 의도 없이 묶이던 문제', () => {
    const passage = buildRichDoc('흔한 지문');
    const next = run(
      base,
      { type: 'applyAiQuestion', card: content({ passage }), target: 'new', originKey: 'msg-1', now: 1 },
      { type: 'applyAiQuestion', card: content({ passage }), target: 'new', originKey: 'msg-2', now: 1 },
    );
    expect(next.cards[0].passageGroupId).not.toBe(next.cards[1].passageGroupId);
  });

  it('지문이 없는 문항은 그룹을 갖지 않는다', () => {
    const next = canvasReducer(base, {
      type: 'applyAiQuestion',
      card: content({ passage: null }),
      target: 'new',
      originKey: 'msg-1',
      now: 1,
    });
    expect(next.cards[0].passageGroupId).toBeNull();
  });

  it('replace:N은 그 자리의 카드 id를 유지한다 — 저장된 문항이 새로 만들어지면 안 된다', () => {
    const seeded: CanvasState = {
      ...base,
      cards: [card({ id: 'q-existing' })],
    };
    const next = canvasReducer(seeded, {
      type: 'applyAiQuestion',
      card: content({ stem: buildRichDoc('교체된 발문') }),
      target: 'replace:1',
      originKey: 'msg-1',
      now: 1,
    });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0].id).toBe('q-existing');
  });

  it('범위 밖 replace는 교체 대신 새 카드로 추가한다', () => {
    const next = canvasReducer(base, {
      type: 'applyAiQuestion',
      card: content(),
      target: 'replace:9',
      originKey: 'msg-1',
      now: 1,
    });
    expect(next.cards).toHaveLength(1);
  });
});

describe('지문 그룹 — 편집 전파', () => {
  const twoInASet = (): CanvasState => ({
    ...initialCanvasState(),
    cards: [
      card({ id: 'q-1', passage: buildRichDoc('원문'), passageGroupId: 'g1' }),
      card({ id: 'q-2', passage: buildRichDoc('원문'), passageGroupId: 'g1' }),
    ],
  });

  it('한 카드의 지문을 고치면 같은 세트에 즉시 반영된다', () => {
    const next = canvasReducer(twoInASet(), {
      type: 'updateCard',
      id: 'q-1',
      patch: { passage: buildRichDoc('고친 지문') },
      now: 1,
    });
    expect(next.cards[1].passage).toBe(next.cards[0].passage);
  });

  it('한 글자만 달라져도 세트는 유지된다 — 평문 일치로 판정하던 시절의 버그', () => {
    const edited = canvasReducer(twoInASet(), {
      type: 'updateCard',
      id: 'q-1',
      patch: { passage: buildRichDoc('원문!') },
      now: 1,
    });
    // 다음 편집도 여전히 짝에게 전파된다(그룹이 안 깨졌다는 뜻).
    const again = canvasReducer(edited, {
      type: 'updateCard',
      id: 'q-1',
      patch: { passage: buildRichDoc('원문!!') },
      now: 1,
    });
    expect(again.cards[1].passage).toBe(again.cards[0].passage);
  });

  it('지문이 아닌 필드를 고치면 짝은 건드리지 않는다', () => {
    const before = twoInASet();
    const next = canvasReducer(before, {
      type: 'updateCard',
      id: 'q-1',
      patch: { points: 5 },
      now: 1,
    });
    expect(next.cards[1]).toBe(before.cards[1]);
  });

  it('지문을 새로 채우면 그때 그룹을 얻고, 지우면 그룹에서 빠진다', () => {
    const withPassage = canvasReducer(
      { ...initialCanvasState(), cards: [card({ id: 'q-1' })] },
      { type: 'updateCard', id: 'q-1', patch: { passage: buildRichDoc('새 지문') }, now: 1 },
    );
    expect(withPassage.cards[0].passageGroupId).toBeTruthy();

    const cleared = canvasReducer(withPassage, {
      type: 'updateCard',
      id: 'q-1',
      patch: { passage: null },
      now: 1,
    });
    expect(cleared.cards[0].passageGroupId).toBeNull();
  });

  it('편집을 마치면 함께 반영된 카드 수를 알린다', () => {
    const next = run(
      twoInASet(),
      { type: 'startEdit', id: 'q-1' },
      { type: 'updateCard', id: 'q-1', patch: { passage: buildRichDoc('고침') }, now: 1 },
      { type: 'finishEdit' },
    );
    expect(next.propagatedTo).toBe(1);
    expect(canvasReducer(next, { type: 'noticeShown' }).propagatedTo).toBe(0);
  });

  it('지문을 안 고쳤으면 알릴 것이 없다', () => {
    const next = run(twoInASet(), { type: 'startEdit', id: 'q-1' }, { type: 'finishEdit' });
    expect(next.propagatedTo).toBe(0);
  });
});

describe('카드 목록 조작', () => {
  const three = (): CanvasState => ({
    ...initialCanvasState(),
    cards: [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' })],
  });

  it('순서를 바꾼다', () => {
    const next = canvasReducer(three(), { type: 'moveCard', from: 0, to: 2 });
    expect(next.cards.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('범위 밖 이동은 아무것도 하지 않는다', () => {
    const before = three();
    expect(canvasReducer(before, { type: 'moveCard', from: 0, to: 9 })).toBe(before);
  });

  it('편집 중인 카드를 지우면 편집 모드도 함께 닫힌다', () => {
    const next = run(three(), { type: 'startEdit', id: 'b' }, { type: 'removeCard', id: 'b' });
    expect(next.editingId).toBeNull();
    expect(next.cards.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('새 카드 id는 같은 밀리초에 만들어도 겹치지 않는다', () => {
    const next = run(
      initialCanvasState(),
      { type: 'addManualCard', card: content(), now: 1700000000000 },
      { type: 'addManualCard', card: content(), now: 1700000000000 },
    );
    expect(next.cards[0].id).not.toBe(next.cards[1].id);
  });
});

describe('문제집 #키워드', () => {
  it('대소문자만 다른 중복은 추가하지 않는다', () => {
    const next = run(
      initialCanvasState(),
      { type: 'addWorkbookKeyword', name: 'Trend' },
      { type: 'addWorkbookKeyword', name: 'trend' },
    );
    expect(next.workbookKeywords).toEqual(['Trend']);
  });

  it('앞의 # 과 공백은 떼고 넣는다', () => {
    const next = canvasReducer(initialCanvasState(), {
      type: 'addWorkbookKeyword',
      name: '  #수능  ',
    });
    expect(next.workbookKeywords).toEqual(['수능']);
  });
});

describe('저장 반영', () => {
  it('새로 만들어진 실제 id로 카드와 지문 그룹을 갈아 끼운다', () => {
    const seeded: CanvasState = {
      ...initialCanvasState(),
      cards: [card({ id: 'local-1-0', passage: buildRichDoc('지문'), passageGroupId: 'local-passage-1' })],
    };
    const next = canvasReducer(seeded, {
      type: 'saveSucceeded',
      outcome: {
        newQuestionIdByCardId: { 'local-1-0': 'q-99' },
        newPassageIdByGroupId: { 'local-passage-1': 'p-99' },
        baseline: { ...emptyBaseline(), questions: { 'q-99': 'fp' } },
        notices: [],
        savedCount: 1,
        skippedCount: 0,
        failedCount: 0,
      },
    });
    expect(next.cards[0].id).toBe('q-99');
    expect(next.cards[0].passageGroupId).toBe('p-99');
    expect(next.baseline.questions['q-99']).toBe('fp');
  });
});

describe('sharedWith — 지문을 공유하는 문항 번호', () => {
  it('같은 그룹의 다른 카드 번호를 1-기반으로 준다', () => {
    const cards = [
      card({ id: 'a', passage: buildRichDoc('p'), passageGroupId: 'g1' }),
      card({ id: 'b' }),
      card({ id: 'c', passage: buildRichDoc('p'), passageGroupId: 'g1' }),
    ];
    expect(sharedWith(cards, 0)).toEqual([3]);
    expect(sharedWith(cards, 1)).toEqual([]);
  });
});
