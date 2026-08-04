import { sanitizeProseMirrorNode, ProseMirrorValidationError } from './prosemirror.sanitize';

/**
 * 프런트 에디터 스키마 ↔ 백엔드 화이트리스트 대조.
 *
 * **왜 이 테스트가 있나:** #41 Phase 1에서 저장 경로의 평문 왕복을 없애면서, 에디터가
 * 만든 rich JSON이 처음으로 그대로 백엔드에 도달하게 됐다. 그 전까지는 무엇을 편집하든
 * `extractPlainText → buildRichBlocks`를 거쳐 paragraph+text로 납작해져서, 화이트리스트에
 * 구멍이 있어도 드러나지 않았다. 이제는 구멍 하나가 곧 **저장 400**이다.
 * (실제로 이 대조에서 `link.title` 누락이 잡혔다.)
 *
 * 아래 표는 `@tiptap/starter-kit` v3의 실제 스키마를 뽑은 스냅샷이다. StarterKit은
 * web/ 쪽 의존성이라 API 테스트에서 직접 import할 수 없어 값으로 고정한다.
 * 에디터 확장을 추가/변경하면 이 표와 화이트리스트를 **같은 커밋에서** 함께 갱신한다.
 *
 * 재생성:
 *   cd web && node -e "import('@tiptap/core').then(async ({getSchema})=>{ \
 *     const {default:SK}=await import('@tiptap/starter-kit'); const s=getSchema([SK]); \
 *     console.log(JSON.stringify({nodes:Object.fromEntries(Object.keys(s.nodes).map(n=>[n,Object.keys(s.nodes[n].spec.attrs??{})])), \
 *     marks:Object.fromEntries(Object.keys(s.marks).map(m=>[m,Object.keys(s.marks[m].spec.attrs??{})]))},null,1)) })"
 */
const STARTERKIT_NODES: Record<string, string[]> = {
  paragraph: [],
  blockquote: [],
  bulletList: [],
  codeBlock: ['language'],
  hardBreak: [],
  heading: ['level'],
  horizontalRule: [],
  listItem: [],
  orderedList: ['start', 'type'],
};

const STARTERKIT_MARKS: Record<string, string[]> = {
  link: ['href', 'target', 'rel', 'class', 'title'],
  bold: [],
  code: [],
  italic: [],
  strike: [],
  underline: [],
};

/** attr에 넣을 그럴듯한 값. 스킴 검증이 있는 href만 실제 URL. */
function sampleAttr(key: string): unknown {
  if (key === 'href') return 'https://example.com';
  if (key === 'level') return 2;
  if (key === 'start') return 3;
  return 'x';
}

const attrsFor = (keys: string[]) =>
  keys.length ? { attrs: Object.fromEntries(keys.map((k) => [k, sampleAttr(k)])) } : {};

/** 자식이 필요한 노드에는 텍스트를 하나 넣어 준다. */
const LEAF_NODES = new Set(['horizontalRule', 'hardBreak']);

describe('StarterKit 스키마 ↔ sanitize 화이트리스트 대조', () => {
  it.each(Object.entries(STARTERKIT_NODES))(
    'StarterKit 노드 %s 를 attrs 전체와 함께 통과시킨다',
    (type, attrKeys) => {
      const node: Record<string, unknown> = { type, ...attrsFor(attrKeys) };
      if (!LEAF_NODES.has(type)) {
        node.content =
          type === 'bulletList' || type === 'orderedList'
            ? [{ type: 'listItem', content: [{ type: 'paragraph' }] }]
            : [{ type: 'text', text: '내용' }];
      }
      // listItem은 블록 자식을 요구하므로 위 분기와 별개로 문단을 넣어 준다.
      if (type === 'listItem') node.content = [{ type: 'paragraph' }];

      expect(() =>
        sanitizeProseMirrorNode({ type: 'doc', content: [node] }),
      ).not.toThrow();
    },
  );

  it.each(Object.entries(STARTERKIT_MARKS))(
    'StarterKit 마크 %s 를 attrs 전체와 함께 통과시킨다',
    (type, attrKeys) => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '내용', marks: [{ type, ...attrsFor(attrKeys) }] }],
          },
        ],
      };
      expect(() => sanitizeProseMirrorNode(doc)).not.toThrow();
    },
  );

  it('구멍이 있으면 저장이 400이 된다는 걸 보여준다(회귀 방지용 반례)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }],
        },
      ],
    };
    // highlight는 StarterKit에 없고 화이트리스트에도 없다 — 에디터에 확장을 추가하면
    // 이렇게 거부되므로 화이트리스트도 같은 커밋에서 넓혀야 한다.
    expect(() => sanitizeProseMirrorNode(doc)).toThrow(ProseMirrorValidationError);
  });
});
