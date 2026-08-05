/**
 * 캔버스 문서 상태의 단일 소유자 (#41 Phase 3).
 *
 * 캔버스는 `useState` 10여 개와 ref 플래그 3개로 상태를 들고 있었다. 개수가 문제가
 * 아니라 **전이가 컴포넌트 곳곳에 흩어져 있던 것**이 문제였다: 지문 편집을 다른 카드에
 * 전파하는 규칙은 `finishEdit` 안에, 하이드레이션이 언제 끝났는지는 ref 두 개에,
 * "이미 사용자가 카드를 넣었으면 덮어쓰지 않는다"는 판단은 `setCards` 업데이터 안에
 * 있었다. 어느 것도 따로 확인할 수 없었다.
 *
 * 여기 모으는 것은 **문서 상태**뿐이다 — 저장하면 서버로 가는 것들.
 * 모바일 탭·제목 편집 중 여부·채팅 프리필처럼 화면에만 사는 상태는 컴포넌트에 남긴다.
 * 섞으면 이 리듀서가 다시 "캔버스의 모든 것"이 된다.
 */
import type { CanvasCard } from './AuthoringCanvas';
import {
  newLocalCardId,
  newLocalPassageGroupId,
  passageGroupOf,
  passageKey,
} from './authoring-save';
import { emptyBaseline, type SaveBaseline, type SaveOutcome } from './authoring-save-run';

export interface CanvasState {
  cards: CanvasCard[];
  subjectId: string;
  isPublic: boolean;
  workbookKeywords: string[];
  /** 편집 중인 카드 — 한 번에 하나. */
  editingId: string | null;
  /** 편집 시작 시점의 지문 그룹 — 완료 시 "지문을 고쳤는가"를 판정하는 기준. */
  editingPassageAtStart: unknown;
  /**
   * 방금 끝난 편집이 지문을 공유하는 카드 **몇 개**에 함께 반영됐는가.
   * 0이면 알릴 것이 없다. 컴포넌트가 토스트로 옮기고 `noticeShown`으로 지운다 —
   * 리듀서가 toast를 직접 부르면 다시 순수하지 않게 된다.
   */
  propagatedTo: number;
  baseline: SaveBaseline;
  /** 기존 문항 복원이 끝났는가. 실패하면 세우지 않아 다음 재조회에서 다시 시도한다. */
  questionsHydrated: boolean;
  /** 문제집 메타(#키워드·공개 설정) 복원이 끝났는가. */
  metaHydrated: boolean;
  /**
   * 같은 AI 응답에서 나온 지문세트를 잇기 위한 유입 경계 장부.
   * 키는 `${응답 키}::${지문 평문}`. 이 장부 **밖에서는** 평문으로 지문을 묶지 않는다.
   */
  aiPassageGroups: Record<string, string>;
  /** local id 생성용 단조 증가 카운터 — 같은 밀리초에 두 장을 만들어도 안 겹친다. */
  seq: number;
}

export function initialCanvasState(initialSubjectId?: string): CanvasState {
  return {
    cards: [],
    subjectId: initialSubjectId ?? '',
    isPublic: false,
    workbookKeywords: [],
    editingId: null,
    editingPassageAtStart: null,
    propagatedTo: 0,
    baseline: emptyBaseline(),
    questionsHydrated: false,
    metaHydrated: false,
    aiPassageGroups: {},
    seq: 0,
  };
}

export type CanvasAction =
  | { type: 'hydrateQuestions'; cards: CanvasCard[]; baseline: SaveBaseline }
  | { type: 'hydrateQuestionsEmpty' }
  | { type: 'hydrateMeta'; keywords: string[]; isPublic: boolean }
  | { type: 'setSubject'; subjectId: string }
  | { type: 'setPublic'; isPublic: boolean }
  | { type: 'addWorkbookKeyword'; name: string }
  | { type: 'removeWorkbookKeyword'; name: string }
  | { type: 'addManualCard'; card: Omit<CanvasCard, 'id' | 'passageGroupId'>; now: number }
  | {
      type: 'applyAiQuestion';
      /** id·passageGroupId를 뺀 카드 내용 — 두 값은 리듀서가 정한다. */
      card: Omit<CanvasCard, 'id' | 'passageGroupId'>;
      /** "new" 또는 "replace:N"(1-기반). */
      target: string;
      /** 이 문항이 나온 AI 응답을 식별하는 키 — 같은 응답의 지문세트를 잇는 데만 쓴다. */
      originKey: string;
      now: number;
    }
  | { type: 'updateCard'; id: string; patch: Partial<CanvasCard>; now: number }
  | { type: 'removeCard'; id: string }
  | { type: 'moveCard'; from: number; to: number }
  | { type: 'startEdit'; id: string }
  | { type: 'finishEdit' }
  | { type: 'noticeShown' }
  | { type: 'saveSucceeded'; outcome: SaveOutcome };

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'hydrateQuestions':
      // 이미 사용자가 카드를 넣었으면 덮어쓰지 않는다 — 복원이 늦게 도착해도
      // 방금 만든 문항을 지우면 안 된다. 그래도 하이드레이션은 끝난 것으로 본다.
      return state.cards.length > 0
        ? { ...state, questionsHydrated: true }
        : {
            ...state,
            cards: action.cards,
            baseline: action.baseline,
            questionsHydrated: true,
          };

    case 'hydrateQuestionsEmpty':
      return { ...state, questionsHydrated: true };

    case 'hydrateMeta':
      if (state.metaHydrated) return state;
      return {
        ...state,
        metaHydrated: true,
        isPublic: action.isPublic,
        workbookKeywords: action.keywords.length ? action.keywords : state.workbookKeywords,
      };

    case 'setSubject':
      return state.subjectId === action.subjectId
        ? state
        : { ...state, subjectId: action.subjectId };

    case 'setPublic':
      return { ...state, isPublic: action.isPublic };

    case 'addWorkbookKeyword': {
      const name = action.name.trim().replace(/^#/, '');
      if (!name) return state;
      const dup = state.workbookKeywords.some((k) => k.toLowerCase() === name.toLowerCase());
      return dup ? state : { ...state, workbookKeywords: [...state.workbookKeywords, name] };
    }

    case 'removeWorkbookKeyword':
      return {
        ...state,
        workbookKeywords: state.workbookKeywords.filter((k) => k !== action.name),
      };

    case 'addManualCard': {
      const card: CanvasCard = {
        ...action.card,
        id: newLocalCardId(state.seq, action.now),
        // 수동 카드는 지문 없이 시작한다. 지문을 채우면 updateCard가 그때 그룹을 만든다.
        passageGroupId: null,
      };
      return { ...state, cards: [...state.cards, card], seq: state.seq + 1 };
    }

    case 'applyAiQuestion': {
      const text = passageKey({ passage: action.card.passage });
      let groups = state.aiPassageGroups;
      let seq = state.seq;
      let passageGroupId: string | null = null;
      if (text) {
        // 같은 응답 + 같은 지문 평문 = 같은 지문세트. 이 판정은 여기서만 한다.
        const originSlot = `${action.originKey}::${text}`;
        passageGroupId = groups[originSlot] ?? null;
        if (!passageGroupId) {
          passageGroupId = newLocalPassageGroupId(seq, action.now);
          groups = { ...groups, [originSlot]: passageGroupId };
          seq += 1;
        }
      }

      const m = /^replace:(\d+)$/.exec(action.target || 'new');
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < state.cards.length) {
          const cards = [...state.cards];
          // 교체는 카드 id를 유지한다 — 이미 저장된 문항이면 새로 만들지 않고 갱신한다.
          cards[idx] = { ...action.card, id: cards[idx].id, passageGroupId };
          return { ...state, cards, aiPassageGroups: groups, seq };
        }
      }
      const card: CanvasCard = {
        ...action.card,
        id: newLocalCardId(seq, action.now),
        passageGroupId,
      };
      return { ...state, cards: [...state.cards, card], aiPassageGroups: groups, seq: seq + 1 };
    }

    case 'updateCard': {
      const target = state.cards.find((c) => c.id === action.id);
      if (!target) return state;
      const next = { ...target, ...action.patch };
      let seq = state.seq;

      // 지문을 새로 채운 카드는 이 자리에서 그룹을 얻는다(그전까지는 그룹 없음).
      if (next.passage && !next.passageGroupId) {
        next.passageGroupId = newLocalPassageGroupId(seq, action.now);
        seq += 1;
      }
      // 지문을 지웠으면 그룹에서 빠진다 — 남겨 두면 저장 때 빈 지문이 되살아난다.
      if (!next.passage) next.passageGroupId = null;

      const group = passageGroupOf(next);
      const passageChanged = 'passage' in action.patch && next.passage !== target.passage;
      const cards = state.cards.map((c) => {
        if (c.id === action.id) return next;
        // 지문 편집은 같은 **그룹**의 카드에 즉시 전파된다. 예전엔 편집을 끝낼 때
        // 평문이 일치하는 카드를 다시 찾아 전파했는데, 편집 도중 한 글자만 달라져도
        // 그 순간 서로 남이 돼 전파 대상에서 빠졌다.
        if (!passageChanged || !group || passageGroupOf(c) !== group) return c;
        return { ...c, passage: next.passage };
      });
      return { ...state, cards, seq };
    }

    case 'removeCard':
      return {
        ...state,
        cards: state.cards.filter((c) => c.id !== action.id),
        editingId: state.editingId === action.id ? null : state.editingId,
      };

    case 'moveCard': {
      const { from, to } = action;
      const len = state.cards.length;
      if (from === to || from < 0 || to < 0 || from >= len || to >= len) return state;
      const cards = [...state.cards];
      const [moved] = cards.splice(from, 1);
      cards.splice(to, 0, moved);
      return { ...state, cards };
    }

    case 'startEdit': {
      const card = state.cards.find((c) => c.id === action.id);
      return {
        ...state,
        editingId: action.id,
        editingPassageAtStart: card?.passage ?? null,
      };
    }

    case 'finishEdit': {
      const edited = state.cards.find((c) => c.id === state.editingId);
      const group = edited ? passageGroupOf(edited) : null;
      const changed = !!edited && edited.passage !== state.editingPassageAtStart;
      const shared =
        changed && group
          ? state.cards.filter((c) => c.id !== edited!.id && passageGroupOf(c) === group).length
          : 0;
      return {
        ...state,
        editingId: null,
        editingPassageAtStart: null,
        propagatedTo: shared,
      };
    }

    case 'noticeShown':
      return state.propagatedTo === 0 ? state : { ...state, propagatedTo: 0 };

    case 'saveSucceeded': {
      const { newQuestionIdByCardId, newPassageIdByGroupId, baseline } = action.outcome;
      const cards = state.cards.map((c) => {
        const newId = newQuestionIdByCardId[c.id];
        const newGroup = c.passageGroupId ? newPassageIdByGroupId[c.passageGroupId] : undefined;
        if (!newId && !newGroup) return c;
        // local id를 실제 id로 갈아 끼운다 — 같은 세션에서 다시 저장해도 중복 생성되지 않는다.
        return {
          ...c,
          ...(newId ? { id: newId } : {}),
          ...(newGroup ? { passageGroupId: newGroup } : {}),
        };
      });
      return { ...state, cards, baseline };
    }

    default:
      return state;
  }
}

/** i번 카드와 지문을 공유하는 다른 카드들의 1-기반 번호. */
export function sharedWith(cards: CanvasCard[], i: number): number[] {
  const group = passageGroupOf(cards[i]);
  if (!group) return [];
  return cards
    .map((c, j) => (j !== i && passageGroupOf(c) === group ? j + 1 : 0))
    .filter((n) => n > 0);
}
