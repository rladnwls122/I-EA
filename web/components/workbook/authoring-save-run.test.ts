import { describe, it, expect, vi } from 'vitest';
import { runSave, emptyBaseline, type SaveClient, type SaveBaseline } from './authoring-save-run';
import { buildRichDoc } from '@/lib/prosemirror-assemble';
import type { CanvasCard } from './AuthoringCanvas';

const card = (over: Partial<CanvasCard> = {}): CanvasCard => ({
  id: 'local-1-0',
  type: '객관식',
  stem: buildRichDoc('발문'),
  passage: null,
  passageGroupId: null,
  choices: [
    { content: buildRichDoc('선지1'), explanation: buildRichDoc(''), showExplanation: false },
    { content: buildRichDoc('선지2'), explanation: buildRichDoc(''), showExplanation: false },
  ],
  correct: 1,
  answerText: '',
  explanation: buildRichDoc(''),
  points: 1,
  keywords: [],
  ...over,
});

/**
 * 호출을 다 세는 가짜 서버.
 *
 * 실패를 만드는 방법이 둘이고, 둘이 서로 다른 상황이다:
 *   - `opts.fail` — 배치는 **항목별로** 성패를 돌려준다. 서버가 그 항목을 거부한 경우.
 *   - 메서드 override — 배치 요청 자체가 못 나갔다(네트워크·400). 묶음 전체가 실패다.
 *
 * `createBatches`/`updateBatches`는 **왕복 수**를 세는 자리다 — 이 모듈이 줄이려던 게 그거다.
 */
function fakeClient(
  over: Partial<SaveClient> = {},
  opts: {
    fail?: { create?: string; update?: string; image?: string };
    batchLimit?: number;
    imageBatchLimit?: number;
  } = {},
) {
  let passageSeq = 0;
  let questionSeq = 0;
  const calls = {
    createPassage: 0,
    updatePassage: 0,
    /** 만들어진 문항 수(항목 기준). 배치 안의 항목도 하나씩 센다. */
    createQuestion: 0,
    /** 갱신된 문항 수(항목 기준). */
    updateQuestion: 0,
    /** 나간 배치 요청 = 왕복. */
    createBatches: [] as unknown[][],
    updateBatches: [] as { id: string; payload: any }[][],
    /** 문제집에 담긴 순서 — 배치에 실린 순서가 그대로 문제집 순서다. */
    addToWorkbook: [] as string[],
    removedFromWorkbook: [] as string[],
    reordered: [] as string[][],
    /** 등록된 이미지(항목 기준) — 배치 안의 항목도 하나씩 센다. */
    registerImage: [] as { storageUrl: string; questionId?: string; passageId?: string }[],
    /** 나간 이미지 배치 요청 = 왕복. 등록이 배치가 된 이유가 이 숫자다(#33 잔여 3). */
    imageBatches: [] as unknown[][],
    updateWorkbook: [] as any[],
  };
  const client: SaveClient = {
    batchLimit: opts.batchLimit ?? 50,
    imageBatchLimit: opts.imageBatchLimit ?? 100,
    createPassage: async () => {
      calls.createPassage += 1;
      return { id: `passage-${++passageSeq}` };
    },
    publishPassage: async () => null,
    updatePassage: async () => {
      calls.updatePassage += 1;
      return null;
    },
    listKeywordTags: async () => [],
    createKeywordTag: async (name) => ({ id: `tag-${name}` }),
    createQuestionsBatch: async (payloads) => {
      calls.createBatches.push(payloads);
      return payloads.map((_, index) => {
        if (opts.fail?.create) return { index, error: opts.fail.create };
        calls.createQuestion += 1;
        const id = `q-${++questionSeq}`;
        calls.addToWorkbook.push(id);
        return { index, questionId: id };
      });
    },
    updateQuestionsBatch: async (items) => {
      calls.updateBatches.push(items as { id: string; payload: any }[]);
      return items.map((item, index) => {
        if (opts.fail?.update) return { index, error: opts.fail.update };
        calls.updateQuestion += 1;
        return { index, questionId: item.id };
      });
    },
    removeQuestionFromWorkbook: async (id) => {
      calls.removedFromWorkbook.push(id);
      return null;
    },
    reorderWorkbookQuestions: async (ids) => {
      calls.reordered.push(ids);
      return null;
    },
    updateWorkbook: async (patch) => {
      calls.updateWorkbook.push(patch);
      return null;
    },
    registerImagesBatch: async (items) => {
      calls.imageBatches.push(items);
      return items.map((item, index) => {
        if (opts.fail?.image) return { index, error: opts.fail.image };
        calls.registerImage.push(item);
        return { index };
      });
    },
    ...over,
  };
  return { client, calls };
}

const input = (over: Partial<Parameters<typeof runSave>[0]> = {}) => ({
  cards: [card()],
  subjectId: 'subj-1',
  workbookKeywords: [],
  isPublic: false,
  visibilityChanged: false,
  compositionKnown: true,
  baseline: emptyBaseline(),
  ...over,
});

describe('runSave — 새 문항 생성', () => {
  it('새 카드는 생성·발행·담기를 거치고 실제 id를 돌려준다', async () => {
    const { client, calls } = fakeClient();
    const out = await runSave(input(), client);

    expect(calls.createQuestion).toBe(1);
    expect(calls.addToWorkbook).toEqual(['q-1']);
    expect(out.newQuestionIdByCardId).toEqual({ 'local-1-0': 'q-1' });
    expect(out.savedCount).toBe(1);
  });

  it('담기는 카드 순서를 지킨다 — 담긴 순서가 곧 문제집 순서라 뒤섞이면 안 된다', async () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      card({ id: `local-1-${i}`, stem: buildRichDoc(`발문${i}`) }),
    );
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);
    expect(calls.addToWorkbook).toEqual(['q-1', 'q-2', 'q-3', 'q-4', 'q-5']);
  });

  it('서버가 거부한 항목은 문제집에 담기지 않고, 그 사유가 그대로 올라온다', async () => {
    // 예전에는 생성·발행·담기가 세 번의 왕복이라 "발행 실패인데 담기를 강행"할 수 있었다.
    // 지금은 셋이 서버에서 한 항목의 원자 단위라 항목이 실패하면 담기지도 않는다 —
    // 프런트가 확인할 것은 그 사실이 실패로 세어지고 사유가 보이는가다.
    const { client, calls } = fakeClient({}, { fail: { create: '발행 권한 없음' } });
    const out = await runSave(input(), client);

    expect(calls.addToWorkbook).toEqual([]);
    expect(out.failedCount).toBe(1);
    expect(out.newQuestionIdByCardId).toEqual({});
    expect(out.notices.some((n) => n.level === 'error' && /발행 권한 없음/.test(n.message))).toBe(
      true,
    );
  });

  it('배치 요청 자체가 못 나가면 그 묶음의 문항이 전부 실패로 세어진다', async () => {
    const { client, calls } = fakeClient({
      createQuestionsBatch: async () => {
        throw new Error('네트워크 오류');
      },
    });
    const cards = [card({ id: 'local-1-0' }), card({ id: 'local-1-1' })];
    const out = await runSave(input({ cards }), client);

    expect(out.failedCount).toBe(2);
    expect(out.savedCount).toBe(0);
    expect(calls.addToWorkbook).toEqual([]);
  });

  it('내용이 없는 카드(빈 발문)는 건너뛴다', async () => {
    const { client, calls } = fakeClient();
    await runSave(input({ cards: [card({ stem: buildRichDoc('') })] }), client);
    expect(calls.createQuestion).toBe(0);
  });
});

describe('runSave — 변경 감지', () => {
  it('저장된 문항이 그대로면 서버에 다시 쓰지 않는다', async () => {
    const persisted = card({ id: 'q-existing' });
    const first = await runSave(input({ cards: [persisted] }), fakeClient().client);

    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards: [persisted], baseline: first.baseline }), client);

    expect(calls.updateQuestion).toBe(0);
    expect(out.skippedCount).toBe(1);
    expect(out.savedCount).toBe(0);
  });

  it('내용을 고치면 그 문항만 다시 쓴다', async () => {
    const a = card({ id: 'q-a' });
    const b = card({ id: 'q-b', stem: buildRichDoc('원래') });
    const first = await runSave(input({ cards: [a, b] }), fakeClient().client);

    const edited = { ...b, stem: buildRichDoc('고침') };
    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards: [a, edited], baseline: first.baseline }), client);

    expect(calls.updateQuestion).toBe(1);
    expect(out.savedCount).toBe(1);
    expect(out.skippedCount).toBe(1);
  });

  it('저장이 실패한 문항의 기준선은 갱신하지 않는다 — 다음 저장에서 다시 시도해야 한다', async () => {
    const persisted = card({ id: 'q-existing' });
    const { client } = fakeClient({}, { fail: { update: '서버 오류' } });
    const seeded: SaveBaseline = { ...emptyBaseline(), questions: { 'q-existing': 'stale' } };
    const out = await runSave(input({ cards: [persisted], baseline: seeded }), client);

    expect(out.failedCount).toBe(1);
    expect(out.baseline.questions['q-existing']).toBe('stale');
  });

  it('바뀐 게 하나도 없으면 실패처럼 읽히는 "0개 저장" 대신 그대로 뒀다고 알린다', async () => {
    const persisted = card({ id: 'q-existing' });
    const first = await runSave(input({ cards: [persisted] }), fakeClient().client);
    const out = await runSave(
      input({ cards: [persisted], baseline: first.baseline }),
      fakeClient().client,
    );
    expect(out.notices.some((n) => n.level === 'success' && /그대로 두었/.test(n.message))).toBe(
      true,
    );
  });
});

describe('runSave — 지문', () => {
  it('같은 그룹의 카드가 여럿이어도 지문은 한 번만 만든다', async () => {
    const cards = [
      card({ id: 'local-1-0', passage: buildRichDoc('지문'), passageGroupId: 'local-passage-1' }),
      card({ id: 'local-1-1', passage: buildRichDoc('지문'), passageGroupId: 'local-passage-1' }),
    ];
    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards }), client);

    expect(calls.createPassage).toBe(1);
    expect(out.newPassageIdByGroupId).toEqual({ 'local-passage-1': 'passage-1' });
  });

  it('지문 평문이 같아도 그룹이 다르면 따로 만든다 — 우연한 일치로 묶이던 버그', async () => {
    const cards = [
      card({ id: 'local-1-0', passage: buildRichDoc('같은 문장'), passageGroupId: 'local-passage-1' }),
      card({ id: 'local-1-1', passage: buildRichDoc('같은 문장'), passageGroupId: 'local-passage-2' }),
    ];
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);
    expect(calls.createPassage).toBe(2);
  });

  it('한 글자만 달라도 같은 그룹이면 하나로 저장된다 — 그룹이 깨지던 버그', async () => {
    const cards = [
      card({ id: 'local-1-0', passage: buildRichDoc('지문 A'), passageGroupId: 'local-passage-1' }),
      card({ id: 'local-1-1', passage: buildRichDoc('지문 B'), passageGroupId: 'local-passage-1' }),
    ];
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);
    expect(calls.createPassage).toBe(1);
  });

  it('이미 저장된 지문은 다시 만들지 않는다 — 저장할 때마다 복제되던 버그', async () => {
    const cards = [card({ id: 'q-1', passage: buildRichDoc('지문'), passageGroupId: 'passage-9' })];
    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards }), client);

    expect(calls.createPassage).toBe(0);
    expect(calls.updatePassage).toBe(1); // 기준선이 없어 한 번은 맞춰 쓴다
    expect(out.baseline.passages['passage-9']).toBeDefined();
  });

  it('저장된 지문의 내용이 그대로면 수정도 하지 않는다', async () => {
    const cards = [card({ id: 'q-1', passage: buildRichDoc('지문'), passageGroupId: 'passage-9' })];
    const first = await runSave(input({ cards }), fakeClient().client);

    const { client, calls } = fakeClient();
    await runSave(input({ cards, baseline: first.baseline }), client);
    expect(calls.updatePassage).toBe(0);
  });

  it('지문이 새로 생기면 안 바뀐 문항이라도 다시 쓴다 — passageId가 달라지기 때문', async () => {
    const persisted = card({
      id: 'q-1',
      passage: buildRichDoc('지문'),
      passageGroupId: 'local-passage-1',
    });
    // 문항 지문(fingerprint)만 기준선에 넣어 "문항은 안 바뀐" 상태를 만든다.
    const primed = await runSave(input({ cards: [persisted] }), fakeClient().client);
    const { client, calls } = fakeClient();
    await runSave(input({ cards: [persisted], baseline: primed.baseline }), client);

    expect(calls.updateQuestion).toBe(1);
  });

  it('지문 생성이 실패해도 문항은 지문 없이 저장된다', async () => {
    const cards = [card({ passage: buildRichDoc('지문'), passageGroupId: 'local-passage-1' })];
    const { client, calls } = fakeClient({
      createPassage: async () => {
        throw new Error('지문 서버 오류');
      },
    });
    const out = await runSave(input({ cards }), client);

    expect(calls.createQuestion).toBe(1);
    expect(out.notices.some((n) => /지문 없이 저장/.test(n.message))).toBe(true);
  });
});

describe('runSave — 이미지 등록', () => {
  const withImage = (src: string) => ({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '발문' }] },
      { type: 'image', attrs: { src } },
    ],
  });

  it('새 문항의 이미지를 저장 직후 등록한다 — 저장 전에는 부를 수 없던 호출', async () => {
    const { client, calls } = fakeClient();
    await runSave(input({ cards: [card({ stem: withImage('https://cdn/a.png') })] }), client);

    expect(calls.registerImage).toEqual([
      { storageUrl: 'https://cdn/a.png', questionId: 'q-1' },
    ]);
  });

  it('불러올 때 이미 있던 이미지는 다시 등록하지 않는다 — 중복 행만 쌓인다', async () => {
    const persisted = card({ id: 'q-1', stem: withImage('https://cdn/old.png') });
    const baseline: SaveBaseline = {
      ...emptyBaseline(),
      registeredImages: ['https://cdn/old.png'],
    };
    const { client, calls } = fakeClient();
    await runSave(input({ cards: [persisted], baseline }), client);
    expect(calls.registerImage).toEqual([]);
  });

  it('지문의 이미지는 지문에 매달아 등록한다', async () => {
    const cards = [
      card({ passage: withImage('https://cdn/p.png'), passageGroupId: 'local-passage-1' }),
    ];
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);

    expect(calls.registerImage).toContainEqual({
      storageUrl: 'https://cdn/p.png',
      passageId: 'passage-1',
    });
  });

  it('등록이 실패해도 저장은 성공으로 남는다 — 이미지는 src로 이미 보인다', async () => {
    const { client } = fakeClient({
      registerImagesBatch: async () => {
        throw new Error('등록 실패');
      },
    });
    const out = await runSave(input({ cards: [card({ stem: withImage('https://cdn/a.png') })] }), client);

    expect(out.failedCount).toBe(0);
    expect(out.savedCount).toBe(1);
  });

  /* 등록 배칭 (#33 도그푸딩 잔여 3) — 예전엔 이미지 장수만큼 왕복이 나갔다. */

  it('이미지가 여러 장이어도 등록 왕복은 한 번이다', async () => {
    const cards = [
      card({ id: 'q-1', stem: withImage('https://cdn/a.png') }),
      card({ id: 'q-2', stem: withImage('https://cdn/b.png') }),
      card({ id: 'q-3', stem: withImage('https://cdn/c.png') }),
    ];
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);

    expect(calls.registerImage).toHaveLength(3);
    expect(calls.imageBatches).toHaveLength(1);
  });

  it('지문 이미지와 문항 이미지가 같은 배치에 실린다 — 따로 보내면 왕복이 다시 갈린다', async () => {
    const cards = [
      card({
        id: 'q-1',
        stem: withImage('https://cdn/q.png'),
        passage: withImage('https://cdn/p.png'),
        passageGroupId: 'local-passage-1',
      }),
    ];
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);

    expect(calls.imageBatches).toHaveLength(1);
    expect(calls.imageBatches[0]).toHaveLength(2);
  });

  it('상한을 넘으면 나눠 보낸다', async () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      card({ id: `q-${i + 1}`, stem: withImage(`https://cdn/${i}.png`) }),
    );
    const { client, calls } = fakeClient({}, { imageBatchLimit: 2 });
    await runSave(input({ cards }), client);

    expect(calls.imageBatches.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it('등록에 실패한 이미지만 기준선에서 빠진다 — 다음 저장이 그것만 다시 시도한다', async () => {
    const { client } = fakeClient({}, { fail: { image: '등록 거부' } });
    const out = await runSave(
      input({ cards: [card({ stem: withImage('https://cdn/a.png') })] }),
      client,
    );

    expect(out.baseline.registeredImages).not.toContain('https://cdn/a.png');
  });

  it('배치 자체가 못 나가도 다음 저장에서 다시 시도된다', async () => {
    const { client } = fakeClient({
      registerImagesBatch: async () => {
        throw new Error('네트워크');
      },
    });
    const out = await runSave(
      input({ cards: [card({ stem: withImage('https://cdn/a.png') })] }),
      client,
    );

    expect(out.baseline.registeredImages).not.toContain('https://cdn/a.png');
  });
});

describe('runSave — 태그와 문제집 메타', () => {
  it('같은 키워드는 태그를 한 번만 만든다', async () => {
    const createKeywordTag = vi.fn(async (name: string) => ({ id: `tag-${name}` }));
    const { client } = fakeClient({ createKeywordTag });
    await runSave(
      input({
        cards: [
          card({ id: 'local-1-0', keywords: ['미적분'] }),
          card({ id: 'local-1-1', keywords: ['미적분', '미적분 '] }),
        ],
        workbookKeywords: ['미적분'],
      }),
      client,
    );
    expect(createKeywordTag).toHaveBeenCalledTimes(1);
  });

  it('공개 설정이 안 바뀌었으면 visibility를 보내지 않는다', async () => {
    const { client, calls } = fakeClient();
    await runSave(input({ visibilityChanged: false }), client);
    expect(calls.updateWorkbook[0]).not.toHaveProperty('visibility');
  });

  it('공개 설정이 바뀌었으면 함께 보내고 알린다', async () => {
    const { client, calls } = fakeClient();
    const out = await runSave(input({ visibilityChanged: true, isPublic: true }), client);
    expect(calls.updateWorkbook[0].visibility).toBe('PUBLIC');
    expect(out.notices.some((n) => /공개로 전환/.test(n.message))).toBe(true);
  });

  it('문항 저장이 실패해도 문제집 메타 반영은 시도한다', async () => {
    const { client, calls } = fakeClient({}, { fail: { create: '문항 서버 오류' } });
    await runSave(input(), client);
    expect(calls.updateWorkbook.length).toBe(1);
  });
});

describe('runSave — 문제집 구성(순서·빼기)', () => {
  const persisted = (id: string) => card({ id, stem: buildRichDoc(`발문 ${id}`) });

  it('카드를 지우면 문제집에서도 뺀다 — 화면에서만 사라지고 새로고침하면 돌아오던 문제', async () => {
    const a = persisted('q-a');
    const b = persisted('q-b');
    const first = await runSave(input({ cards: [a, b] }), fakeClient().client);

    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards: [a], baseline: first.baseline }), client);

    expect(calls.removedFromWorkbook).toEqual(['q-b']);
    expect(out.baseline.questions['q-b']).toBeUndefined();
  });

  it('순서를 서버에 보낸다 — 서버가 빠짐없는 전체 집합을 요구하므로 카드 순서 그대로', async () => {
    const a = persisted('q-a');
    const b = persisted('q-b');
    const first = await runSave(input({ cards: [a, b] }), fakeClient().client);

    const { client, calls } = fakeClient();
    await runSave(input({ cards: [b, a], baseline: first.baseline }), client);

    expect(calls.reordered).toEqual([['q-b', 'q-a']]);
  });

  it('새로 만든 문항은 실제 id로 순서에 실린다', async () => {
    const { client, calls } = fakeClient();
    await runSave(input({ cards: [card({ id: 'local-1-0' }), card({ id: 'local-1-1' })] }), client);
    expect(calls.reordered).toEqual([['q-1', 'q-2']]);
  });

  it('실패한 문항이 있으면 순서·빼기를 건너뛰고 그 사실을 알린다', async () => {
    // 서버는 순서 API에 빠짐없는 집합을 요구한다 — 저장 못 한 문항이 있으면 400이 되고,
    // 그 상태에서 삭제까지 밀어붙이면 의도치 않은 결과가 남는다.
    const a = persisted('q-a');
    const b = persisted('q-b');
    const first = await runSave(input({ cards: [a, b] }), fakeClient().client);

    const edited = { ...a, stem: buildRichDoc('고침') };
    const { client, calls } = fakeClient({}, { fail: { update: '서버 오류' } });
    const out = await runSave(input({ cards: [edited], baseline: first.baseline }), client);

    expect(calls.removedFromWorkbook).toEqual([]);
    expect(calls.reordered).toEqual([]);
    expect(out.notices.some((n) => /순서와 삭제는 반영하지 않/.test(n.message))).toBe(true);
  });
});

describe('runSave — 삭제를 표현할 수 있는 페이로드', () => {
  it('마지막 키워드를 지우면 빈 tagIds를 명시해 보낸다 — 생략하면 서버가 그대로 둔다', async () => {
    const withTag = card({ id: 'q-1', keywords: ['미적분'] });
    const first = await runSave(input({ cards: [withTag] }), fakeClient().client);

    const { client, calls } = fakeClient();
    await runSave(input({ cards: [{ ...withTag, keywords: [] }], baseline: first.baseline }), client);
    expect(calls.updateBatches[0][0].payload.tagIds).toEqual([]);
  });

  it('지문을 떼면 passageId: null을 명시해 보낸다', async () => {
    const withPassage = card({
      id: 'q-1',
      passage: buildRichDoc('지문'),
      passageGroupId: 'passage-9',
    });
    const first = await runSave(input({ cards: [withPassage] }), fakeClient().client);

    const { client, calls } = fakeClient();
    await runSave(
      input({
        cards: [{ ...withPassage, passage: null, passageGroupId: null }],
        baseline: first.baseline,
      }),
      client,
    );
    expect(calls.updateBatches[0][0].payload.passageId).toBeNull();
  });
});

describe('runSave — 부분 실패는 동기화된 것으로 기록하지 않는다', () => {
  it('태그를 못 만들면 기준선을 세우지 않는다 — 세우면 그 키워드가 영영 누락된다', async () => {
    const { client } = fakeClient({
      createKeywordTag: async () => {
        throw new Error('태그 생성 실패');
      },
    });
    const out = await runSave(input({ cards: [card({ id: 'q-1', keywords: ['미적분'] })] }), client);
    expect(out.savedCount).toBe(1);
    expect(out.baseline.questions['q-1']).toBeUndefined();
  });

  it('지문을 가진 새 문항은 다음 저장에서 헛 PATCH를 맞지 않는다', async () => {
    const fresh = card({
      id: 'local-1-0',
      passage: buildRichDoc('지문'),
      passageGroupId: 'local-passage-1',
    });
    const first = await runSave(input({ cards: [fresh] }), fakeClient().client);

    // 저장 뒤 리듀서가 하는 일: 카드 id와 지문 그룹 id를 실제 id로 교체.
    const afterSave = {
      ...fresh,
      id: first.newQuestionIdByCardId['local-1-0'],
      passageGroupId: first.newPassageIdByGroupId['local-passage-1'],
    };
    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards: [afterSave], baseline: first.baseline }), client);

    expect(calls.updateQuestion).toBe(0);
    expect(out.skippedCount).toBe(1);
  });

  it('발문이 빈 카드의 지문은 만들지 않는다 — 어디에도 안 붙는 지문 행이 생긴다', async () => {
    const { client, calls } = fakeClient();
    await runSave(
      input({
        cards: [
          card({
            stem: buildRichDoc(''),
            passage: buildRichDoc('지문'),
            passageGroupId: 'local-passage-1',
          }),
        ],
      }),
      client,
    );
    expect(calls.createPassage).toBe(0);
  });

  it('기존 지문에 새로 넣은 이미지도 등록한다', async () => {
    const withImage = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://cdn/p.png' } }],
    };
    const cards = [card({ id: 'q-1', passage: withImage, passageGroupId: 'passage-9' })];
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);

    expect(calls.registerImage).toContainEqual({
      storageUrl: 'https://cdn/p.png',
      passageId: 'passage-9',
    });
  });

  it('같은 이미지가 여러 카드에 실려 있어도 한 번만 등록한다', async () => {
    const src = 'https://cdn/shared.png';
    const withImage = (n: string) => ({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: n }] },
        { type: 'image', attrs: { src } },
      ],
    });
    const cards = [
      card({ id: 'q-1', stem: withImage('1') }),
      card({ id: 'q-2', stem: withImage('2') }),
      card({ id: 'q-3', stem: withImage('3') }),
      card({ id: 'q-4', stem: withImage('4') }),
    ];
    // 대기줄에 넣을 때 이미 본 URL을 걸러야 한다 — 안 그러면 같은 그림이 배치 한 번에
    // 네 번 실려 나가고, 서버 멱등 처리에 기대는 모양이 된다(왕복은 줄어도 페이로드는 는다).
    const { client, calls } = fakeClient();
    await runSave(input({ cards }), client);

    expect(calls.registerImage.filter((c) => c.storageUrl === src)).toHaveLength(1);
  });
});

describe('runSave — 목록이 문제집의 전부가 아닐 때', () => {
  it('순서·빼기를 손대지 않는다 — 반쪽 목록으로 보내면 서버가 누락 400을 준다', async () => {
    const a = card({ id: 'q-a' });
    const b = card({ id: 'q-b', stem: buildRichDoc('발문 b') });
    const first = await runSave(input({ cards: [a, b] }), fakeClient().client);

    const { client, calls } = fakeClient();
    await runSave(
      input({ cards: [a], baseline: first.baseline, compositionKnown: false }),
      client,
    );

    expect(calls.removedFromWorkbook).toEqual([]);
    expect(calls.reordered).toEqual([]);
  });
});

describe('runSave — 왕복 수', () => {
  const many = (n: number, id: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => card({ id: id(i), stem: buildRichDoc(`발문${i}`) }));

  it('20문항 첫 저장의 생성 왕복은 1회다 — 예전엔 문항당 3회(생성·발행·담기)라 60회였다', async () => {
    const { client, calls } = fakeClient();
    await runSave(input({ cards: many(20, (i) => `local-1-${i}`) }), client);

    expect(calls.createBatches).toHaveLength(1);
    expect(calls.createBatches[0]).toHaveLength(20);
    expect(calls.createQuestion).toBe(20);
  });

  it('20문항 중 5개를 고치면 갱신 왕복은 1회다 — 예전엔 5회였다', async () => {
    const cards = many(20, (i) => `q-${i}`);
    const first = await runSave(input({ cards }), fakeClient().client);

    const edited = cards.map((c, i) => (i < 5 ? { ...c, stem: buildRichDoc(`고침${i}`) } : c));
    const { client, calls } = fakeClient();
    const out = await runSave(input({ cards: edited, baseline: first.baseline }), client);

    expect(calls.updateBatches).toHaveLength(1);
    expect(calls.updateBatches[0]).toHaveLength(5);
    expect(out.savedCount).toBe(5);
    expect(out.skippedCount).toBe(15);
  });

  it('바뀐 게 없으면 배치를 아예 보내지 않는다', async () => {
    const cards = many(3, (i) => `q-${i}`);
    const first = await runSave(input({ cards }), fakeClient().client);

    const { client, calls } = fakeClient();
    await runSave(input({ cards, baseline: first.baseline }), client);
    expect(calls.updateBatches).toHaveLength(0);
    expect(calls.createBatches).toHaveLength(0);
  });
});

describe('runSave — 배치 상한', () => {
  it('상한을 넘으면 나눠 보내되 담기는 순서를 지킨다 — 순서가 곧 문제집 순서다', async () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      card({ id: `local-1-${i}`, stem: buildRichDoc(`발문${i}`) }),
    );
    const { client, calls } = fakeClient({}, { batchLimit: 2 });
    await runSave(input({ cards }), client);

    expect(calls.createBatches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(calls.addToWorkbook).toEqual(['q-1', 'q-2', 'q-3', 'q-4', 'q-5']);
    expect(calls.reordered).toEqual([['q-1', 'q-2', 'q-3', 'q-4', 'q-5']]);
  });

  it('갱신도 상한만큼 나눠 보낸다', async () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      card({ id: `q-${i}`, stem: buildRichDoc(`발문${i}`) }),
    );
    const { client, calls } = fakeClient({}, { batchLimit: 2 });
    await runSave(input({ cards }), client);
    expect(calls.updateBatches.map((b) => b.length)).toEqual([2, 2, 1]);
  });
});

describe('runSave — 배치의 항목별 실패', () => {
  /** 지정한 자리만 실패로 돌려주는 서버. 배치의 존재 이유가 걸린 지점이다. */
  const failingAt = (failIndexes: number[]) => {
    const added: string[] = [];
    let seq = 0;
    const client = fakeClient({
      createQuestionsBatch: async (payloads) =>
        payloads.map((_, index) => {
          if (failIndexes.includes(index)) return { index, error: `${index}번 거부` };
          const id = `q-${++seq}`;
          added.push(id);
          return { index, questionId: id };
        }),
    }).client;
    return { client, added };
  };

  it('한 항목이 실패해도 나머지는 저장된다 — 전부 실패로 뭉개면 정밀도가 사라진다', async () => {
    const cards = Array.from({ length: 3 }, (_, i) =>
      card({ id: `local-1-${i}`, stem: buildRichDoc(`발문${i}`) }),
    );
    const { client, added } = failingAt([1]);
    const out = await runSave(input({ cards }), client);

    expect(out.savedCount).toBe(2);
    expect(out.failedCount).toBe(1);
    expect(added).toEqual(['q-1', 'q-2']);
    // 실패한 카드만 id를 못 받는다 — 다음 저장에서 다시 생성된다.
    expect(out.newQuestionIdByCardId).toEqual({ 'local-1-0': 'q-1', 'local-1-2': 'q-2' });
  });

  it('실패한 항목의 기준선만 갱신하지 않는다', async () => {
    const cards = [card({ id: 'q-a' }), card({ id: 'q-b', stem: buildRichDoc('발문 b') })];
    const { client } = fakeClient({
      updateQuestionsBatch: async (items) =>
        items.map((item, index) =>
          index === 1 ? { index, error: '거부' } : { index, questionId: item.id },
        ),
    });
    const out = await runSave(input({ cards }), client);

    expect(out.baseline.questions['q-a']).toBeDefined();
    expect(out.baseline.questions['q-b']).toBeUndefined();
  });

  it('응답에 없는 항목은 실패로 센다 — 성공으로 치면 기준선이 박혀 영영 어긋난다', async () => {
    const cards = [card({ id: 'q-a' }), card({ id: 'q-b', stem: buildRichDoc('발문 b') })];
    const { client } = fakeClient({
      // 서버가 두 번째 항목의 결과를 빠뜨렸다.
      updateQuestionsBatch: async (items) => [{ index: 0, questionId: items[0].id }],
    });
    const out = await runSave(input({ cards }), client);

    expect(out.failedCount).toBe(1);
    expect(out.baseline.questions['q-b']).toBeUndefined();
  });

  it('실패한 항목이 있으면 순서·빼기는 그대로 건너뛴다', async () => {
    const cards = Array.from({ length: 3 }, (_, i) =>
      card({ id: `local-1-${i}`, stem: buildRichDoc(`발문${i}`) }),
    );
    const { client } = failingAt([0]);
    const out = await runSave(input({ cards }), client);
    expect(out.notices.some((n) => /순서와 삭제는 반영하지 않/.test(n.message))).toBe(true);
  });
});

describe('runSave — 병렬 갱신 경로의 태그 중복 생성', () => {
  it('여러 카드가 같은 새 키워드를 쓰면 태그를 한 번만 만든다', async () => {
    // 앞의 "같은 키워드는 태그를 한 번만" 케이스는 카드가 하나뿐이라 경합 자체가 없었다.
    // 배치가 되면서 페이로드(=태그 해석)를 카드 전부에 대해 한꺼번에 만들게 됐으므로,
    // 해석과 기록 사이에 await이 끼는 상황을 지연으로 실제로 만든다.
    const cards = ['q-1', 'q-2', 'q-3', 'q-4'].map((id) =>
      card({ id, stem: buildRichDoc(`발문 ${id}`), keywords: ['새키워드'] }),
    );
    let created = 0;
    const { client } = fakeClient({
      createKeywordTag: async (name) => {
        created += 1;
        await new Promise((r) => setTimeout(r, 5));
        return { id: `tag-${name}` };
      },
    });
    await runSave(input({ cards }), client);

    expect(created).toBe(1);
  });
});
