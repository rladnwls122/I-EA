import { sanitizeProseMirrorBlocks, sanitizeProseMirrorNode } from './prosemirror.sanitize';

/**
 * #41 Phase 1의 핵심 주장을 고정하는 테스트: **저장을 거쳐도 서식이 살아남는다.**
 *
 * 예전 캔버스는 저장할 때 `extractPlainText → buildRichBlocks`를 태웠다. 그래서
 * 굵게·목록·제목을 넣어도 저장 한 번에 전부 paragraph+text로 납작해졌다.
 * 프런트가 이제 doc 래퍼만 벗겨 보내므로(`docToBlocks`), 백엔드 sanitize를 통과한
 * 결과가 입력과 **구조적으로 같아야** 한다. 여기서 깨지면 서식 유실이 돌아온 것이다.
 *
 * (프런트 헬퍼 자체의 단위 테스트는 web/에 러너가 없어 여기서 백엔드 계약으로 고정한다.
 *  docToBlocks/blocksToDoc은 감싸기·벗기기뿐이라 아래 블록 배열이 그 출력과 동일하다.)
 */

/** 캔버스에서 서식을 넣어 편집한 해설이 `docToBlocks` 후 갖는 모양. */
const EDITED_EXPLANATION_BLOCKS = [
  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '풀이 요지' }] },
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: '정답은 ' },
      { type: 'text', text: '2번', marks: [{ type: 'bold' }] },
      { type: 'text', text: '이다. ' },
      { type: 'text', text: '함정 주의', marks: [{ type: 'italic' }, { type: 'underline' }] },
    ],
  },
  {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '근거 1' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '근거 2' }] }] },
    ],
  },
  { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '출처 인용' }] }] },
];

describe('#41 Phase 1 — 저장 왕복에서 서식 보존', () => {
  it('서식 있는 해설 블록 배열이 sanitize를 통과하며 구조가 그대로 남는다', () => {
    const out = sanitizeProseMirrorBlocks(EDITED_EXPLANATION_BLOCKS, 'explanation');
    expect(out).toEqual(EDITED_EXPLANATION_BLOCKS);
  });

  it('굵게/기울임/밑줄 마크가 살아남는다 (평문 왕복이면 전부 사라진다)', () => {
    const out = sanitizeProseMirrorBlocks(EDITED_EXPLANATION_BLOCKS, 'explanation') as any[];
    const marks = out[1].content.flatMap((n: any) => (n.marks ?? []).map((m: any) => m.type));
    expect(marks).toEqual(['bold', 'italic', 'underline']);
  });

  it('제목·목록·인용 같은 블록 노드가 paragraph로 납작해지지 않는다', () => {
    const out = sanitizeProseMirrorBlocks(EDITED_EXPLANATION_BLOCKS, 'explanation') as any[];
    expect(out.map((n) => n.type)).toEqual(['heading', 'paragraph', 'bulletList', 'blockquote']);
    expect(out[0].attrs).toEqual({ level: 3 });
  });

  it('서식 있는 발문(doc)도 통과하며 구조가 보존된다', () => {
    const stem = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '다음 중 ' },
            { type: 'text', text: '옳지 않은', marks: [{ type: 'underline' }] },
            { type: 'text', text: ' 것은?' },
          ],
        },
      ],
    };
    expect(sanitizeProseMirrorNode(stem, 'stem')).toEqual(stem);
  });

  it('sanitize는 입력 객체를 변형하지 않는다(캔버스 state 오염 방지)', () => {
    const before = JSON.stringify(EDITED_EXPLANATION_BLOCKS);
    sanitizeProseMirrorBlocks(EDITED_EXPLANATION_BLOCKS, 'explanation');
    expect(JSON.stringify(EDITED_EXPLANATION_BLOCKS)).toBe(before);
  });
});
