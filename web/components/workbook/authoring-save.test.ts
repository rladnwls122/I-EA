import { describe, it, expect } from 'vitest';
import {
  buildQuestionPayload,
  isPersistedCard,
  isSavableCard,
  newLocalCardId,
  normalizeKeywords,
  passageKey,
  uniquePassages,
  validateSave,
} from './authoring-save';
import { buildRichDoc, buildRichBlocks } from '@/lib/prosemirror-assemble';
import type { CanvasCard } from './AuthoringCanvas';

const card = (over: Partial<CanvasCard> = {}): CanvasCard => ({
  id: 'local-1-0',
  type: '객관식',
  stem: buildRichDoc('발문'),
  passage: null,
  passageGroupId: null,
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

describe('validateSave — 저장 사전검증', () => {
  const ok = { cardCount: 3, subjectId: 's1', workbookLoaded: true };

  it('조건이 다 맞으면 null(진행 가능)', () => {
    expect(validateSave(ok)).toBeNull();
  });

  it('카드가 없으면 막는다', () => {
    expect(validateSave({ ...ok, cardCount: 0 })).toMatch(/저장할 문항이 없/);
  });

  it('과목이 없으면 막는다', () => {
    expect(validateSave({ ...ok, subjectId: '' })).toMatch(/과목 정보/);
  });

  it('문제집을 못 불러왔으면 막는다 — 담기가 100% 실패하므로 미리 끊는다', () => {
    expect(validateSave({ ...ok, workbookLoaded: false })).toMatch(/문제집을 불러오지/);
  });

  it('여러 조건이 동시에 틀리면 가장 흔한 것부터 알려 준다', () => {
    expect(validateSave({ cardCount: 0, subjectId: '', workbookLoaded: false })).toMatch(
      /저장할 문항이 없/,
    );
  });
});

describe('카드 id 규약', () => {
  it('새 카드 id는 local- 접두를 갖는다', () => {
    expect(newLocalCardId(0, 1700000000000)).toBe('local-1700000000000-0');
  });

  it('같은 시각이라도 순번으로 서로 다르다', () => {
    const t = 1700000000000;
    expect(newLocalCardId(0, t)).not.toBe(newLocalCardId(1, t));
  });

  it('local- 카드는 아직 저장되지 않은 것으로 본다', () => {
    expect(isPersistedCard(newLocalCardId(0))).toBe(false);
  });

  it('실제 question id는 저장된 것으로 본다', () => {
    expect(isPersistedCard('7f1c2a3e-0000-4000-8000-000000000000')).toBe(true);
  });
});

describe('passageKey / uniquePassages — 지문 공유', () => {
  it('지문이 없으면 키가 없다(그룹으로 묶지 않는다)', () => {
    expect(passageKey(card({ passage: null }))).toBeNull();
  });

  it('공백만 있는 지문도 키가 없다', () => {
    expect(passageKey(card({ passage: buildRichDoc('   ') }))).toBeNull();
  });

  it('같은 세트는 한 번만 생성 대상이 된다', () => {
    const out = uniquePassages([
      card({ passage: buildRichDoc('(가) 지문'), passageGroupId: 'g1' }),
      card({ passage: buildRichDoc('(가) 지문'), passageGroupId: 'g1' }),
      card({ passage: buildRichDoc('다른 지문'), passageGroupId: 'g2' }),
    ]);
    expect(out.map((p) => p.groupId)).toEqual(['g1', 'g2']);
  });

  it('지문 없는 카드는 목록에 들어가지 않는다', () => {
    expect(uniquePassages([card({ passage: null }), card({ passage: null })])).toEqual([]);
  });

  it('한 글자만 달라도 같은 세트면 하나로 본다 — 평문 일치로 판정하던 시절의 한계 제거', () => {
    const out = uniquePassages([
      card({ passage: buildRichDoc('지문 A'), passageGroupId: 'g1' }),
      card({ passage: buildRichDoc('지문 A.'), passageGroupId: 'g1' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('평문이 같아도 세트가 다르면 따로 만든다 — 우연히 묶이던 한계 제거', () => {
    const out = uniquePassages([
      card({ passage: buildRichDoc('흔한 지문'), passageGroupId: 'g1' }),
      card({ passage: buildRichDoc('흔한 지문'), passageGroupId: 'g2' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('그룹 id가 없으면(유입 전) 저장 대상이 아니다 — 지문 없는 것과 같이 취급', () => {
    expect(uniquePassages([card({ passage: buildRichDoc('지문'), passageGroupId: null })])).toEqual(
      [],
    );
  });
});

describe('normalizeKeywords — 태그 중복 생성 방지', () => {
  it('공백을 다듬고 빈 값을 버린다', () => {
    expect(normalizeKeywords([' 함수 ', '', '   '])).toEqual(['함수']);
  });

  it('대소문자 무시 중복을 제거한다(같은 태그 두 번 만들지 않게)', () => {
    expect(normalizeKeywords(['Limit', 'limit', 'LIMIT'])).toEqual(['Limit']);
  });

  it('입력 순서를 유지한다', () => {
    expect(normalizeKeywords(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });
});

describe('isSavableCard', () => {
  it('발문이 비면 저장 대상이 아니다', () => {
    expect(isSavableCard(card({ stem: buildRichDoc('') }))).toBe(false);
  });

  it('이미지만 있는 발문도 저장 대상이다(텍스트가 아니라 내용 기준)', () => {
    const imageStem = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://x/y.png' } }],
    };
    expect(isSavableCard(card({ stem: imageStem }))).toBe(true);
  });
});

describe('buildQuestionPayload', () => {
  it('객관식은 선지를 c1..cN으로 매기고 정답 하나를 표시한다', () => {
    const p = buildQuestionPayload(card({ correct: 1 }), { tagIds: [] }) as any;
    expect(p.choices.map((c: any) => c.id)).toEqual(['c1', 'c2']);
    expect(p.choices.map((c: any) => c.isCorrect)).toEqual([false, true]);
  });

  it('주관식은 선지를 보내지 않고 정답 텍스트를 보낸다', () => {
    const p = buildQuestionPayload(
      card({ type: '주관식', answerText: '  42  ', choices: [] }),
      { tagIds: [] },
    ) as any;
    expect(p.choices).toBeUndefined();
    expect(p.correctAnswerText).toBe('42');
  });

  it('빈 해설은 아예 필드를 보내지 않는다', () => {
    expect((buildQuestionPayload(card(), { tagIds: [] }) as any).explanation).toBeUndefined();
  });

  it('해설은 doc 래퍼만 벗겨 블록 배열로 — 평문 왕복 금지(#41 Phase 1)', () => {
    const rich = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '요지' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '굵게', marks: [{ type: 'bold' }] }],
        },
      ],
    };
    const p = buildQuestionPayload(card({ explanation: rich }), { tagIds: [] }) as any;
    expect(p.explanation).toEqual(rich.content);
  });

  it('편집하지 않은 선지는 원본 노드를 그대로 돌려보낸다(서식 보존)', () => {
    const source = buildRichBlocks('선지1');
    const p = buildQuestionPayload(
      card({
        choices: [
          { text: '선지1', explanation: '', showExplanation: false, sourceContent: source },
          { text: '선지2', explanation: '', showExplanation: false },
        ],
      }),
      { tagIds: [] },
    ) as any;
    expect(p.choices[0].content).toBe(source);
  });

  it('텍스트를 고친 선지는 평문으로 새로 짓는다', () => {
    const source = buildRichBlocks('예전 텍스트');
    const p = buildQuestionPayload(
      card({
        choices: [
          { text: '새 텍스트', explanation: '', showExplanation: false, sourceContent: source },
          { text: '선지2', explanation: '', showExplanation: false },
        ],
      }),
      { tagIds: [] },
    ) as any;
    expect(p.choices[0].content).not.toBe(source);
    expect(p.choices[0].content).toEqual(buildRichDoc('새 텍스트'));
  });

  it('선지 해설이 있으면 공개 여부까지 함께 싣는다', () => {
    const p = buildQuestionPayload(
      card({
        choices: [
          { text: '선지1', explanation: '이유', showExplanation: true },
          { text: '선지2', explanation: '', showExplanation: false },
        ],
      }),
      { tagIds: [] },
    ) as any;
    expect(p.choices[0].explanationVisible).toBe(true);
    expect(p.choices[1].explanation).toBeUndefined();
  });

  it('tagIds·passageId는 비어 있어도 반드시 싣는다 — 생략하면 삭제를 표현할 수 없다', () => {
    // 백엔드 PATCH는 필드가 없으면 "안 건드림"으로 읽는다. 예전처럼 빈 값을 생략하면
    // 마지막 키워드를 지우거나 지문을 떼도 서버에는 그대로 남고, 변경 감지가 그 상태를
    // "동기화됨"으로 기준선에 박아 다음 저장에서도 건너뛴다.
    const bare = buildQuestionPayload(card(), { tagIds: [] }) as any;
    expect(bare.tagIds).toEqual([]);
    expect(bare.passageId).toBeNull();

    const full = buildQuestionPayload(card(), { tagIds: ['t1'], passageId: 'p1' }) as any;
    expect(full.tagIds).toEqual(['t1']);
    expect(full.passageId).toBe('p1');
  });
});
