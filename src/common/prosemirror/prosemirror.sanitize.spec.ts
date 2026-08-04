import {
  ProseMirrorValidationError,
  sanitizeProseMirrorBlocks,
  sanitizeProseMirrorNode,
} from './prosemirror.sanitize';
import { validateChoices } from './is-prosemirror.decorator';
import { buildRichDoc, buildRichBlocks } from './prosemirror.util';

const doc = (content: unknown[]) => ({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('sanitizeProseMirrorNode — 정상 입력', () => {
  it('우리 코드가 만든 doc(buildRichDoc)을 그대로 통과시킨다', () => {
    const built = buildRichDoc('첫 문단\n둘째 문단');
    expect(() => sanitizeProseMirrorNode(built)).not.toThrow();
  });

  it('StarterKit 노드(heading/list/blockquote/codeBlock)를 허용한다', () => {
    const rich = doc([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '제목' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [para('항목')] }] },
      { type: 'blockquote', content: [para('인용')] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'x' }] },
      { type: 'horizontalRule' },
    ]);
    expect(() => sanitizeProseMirrorNode(rich)).not.toThrow();
  });

  it('허용 마크(bold/italic/link)를 유지한다', () => {
    const node = doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '링크',
            marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }],
          },
        ],
      },
    ]);
    const out = sanitizeProseMirrorNode(node) as { content: { content: { marks: unknown[] }[] }[] };
    expect(out.content[0].content[0].marks).toEqual([
      { type: 'bold' },
      { type: 'link', attrs: { href: 'https://example.com' } },
    ]);
  });

  it('null attrs는 조용히 흘린다(Tiptap이 미설정 attr을 null로 보낸다)', () => {
    const out = sanitizeProseMirrorNode({
      type: 'paragraph',
      attrs: { textAlign: null },
    }) as Record<string, unknown>;
    expect(out.attrs).toBeUndefined();
  });
});

describe('sanitizeProseMirrorNode — 차단', () => {
  it('허용 목록에 없는 노드 타입을 거부한다', () => {
    expect(() => sanitizeProseMirrorNode(doc([{ type: 'iframe' }]))).toThrow(
      ProseMirrorValidationError,
    );
  });

  it('허용 목록에 없는 마크 타입을 거부한다', () => {
    const node = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'evil' }] }] },
    ]);
    expect(() => sanitizeProseMirrorNode(node)).toThrow(/허용되지 않은 마크 타입/);
  });

  it('허용되지 않은 attrs 키(onclick 등)를 거부한다', () => {
    expect(() =>
      sanitizeProseMirrorNode(doc([{ type: 'paragraph', attrs: { onclick: 'alert(1)' } }])),
    ).toThrow(/허용되지 않은 속성/);
  });

  it('link href의 javascript: 스킴을 거부한다', () => {
    const node = doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ]);
    expect(() => sanitizeProseMirrorNode(node)).toThrow(/허용되지 않은 URL 스킴/);
  });

  it('image src의 data: 스킴을 거부한다', () => {
    expect(() =>
      sanitizeProseMirrorNode(
        doc([{ type: 'image', attrs: { src: 'data:text/html;base64,PHNjcmlwdD4=' } }]),
      ),
    ).toThrow(/허용되지 않은 URL 스킴/);
  });

  it('text 노드에 문자열 text가 없으면 거부한다', () => {
    expect(() => sanitizeProseMirrorNode(doc([{ type: 'text', text: { evil: 1 } }]))).toThrow(
      /문자열 text/,
    );
  });

  it('중첩이 상한을 넘으면 거부한다(스택 폭파 방어)', () => {
    let deep: unknown = para('bottom');
    for (let i = 0; i < 60; i++) deep = { type: 'blockquote', content: [deep] };
    expect(() => sanitizeProseMirrorNode(deep)).toThrow(/중첩이 너무 깊습니다/);
  });

  it('노드 수가 상한을 넘으면 거부한다', () => {
    const huge = doc(Array.from({ length: 6000 }, () => ({ type: 'horizontalRule' })));
    expect(() => sanitizeProseMirrorNode(huge)).toThrow(/노드 수가 상한/);
  });
});

describe('sanitizeProseMirrorBlocks', () => {
  it('buildRichBlocks 출력(블록 배열)을 통과시킨다', () => {
    expect(() => sanitizeProseMirrorBlocks(buildRichBlocks('해설 본문'))).not.toThrow();
  });

  it('배열이 아니면 거부한다', () => {
    expect(() => sanitizeProseMirrorBlocks({ type: 'doc' })).toThrow(/배열이어야 합니다/);
  });
});

describe('validateChoices', () => {
  const choice = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    isCorrect: true,
    content: buildRichBlocks('선지'),
    ...over,
  });

  it('정상 선지 배열을 통과시킨다', () => {
    expect(() => validateChoices([choice(), choice({ id: 'c2', isCorrect: false })], 'choices')).not.toThrow();
  });

  it('content가 doc 노드여도 통과시킨다(프런트 에디터가 보내는 형태)', () => {
    expect(() => validateChoices([choice({ content: buildRichDoc('선지') })], 'choices')).not.toThrow();
  });

  it('explanationVisible(AuthoringCanvas가 보내는 필드)을 허용한다', () => {
    expect(() =>
      validateChoices(
        [choice({ explanation: buildRichBlocks('해설'), explanationVisible: true })],
        'choices',
      ),
    ).not.toThrow();
  });

  it('doc 노드 content 안의 악성 노드도 잡는다', () => {
    expect(() =>
      validateChoices([choice({ content: { type: 'doc', content: [{ type: 'iframe' }] } })], 'choices'),
    ).toThrow(/허용되지 않은 노드 타입/);
  });

  it('선지 content 안의 악성 노드도 잡는다', () => {
    expect(() => validateChoices([choice({ content: [{ type: 'script' }] })], 'choices')).toThrow(
      /허용되지 않은 노드 타입/,
    );
  });

  it('알 수 없는 키를 거부한다', () => {
    expect(() => validateChoices([choice({ payload: 'x' })], 'choices')).toThrow(
      /허용되지 않은 키/,
    );
  });

  it('id가 없으면 거부한다', () => {
    expect(() => validateChoices([choice({ id: undefined })], 'choices')).toThrow(/id/);
  });

  it('isCorrect가 불리언이 아니면 거부한다', () => {
    expect(() => validateChoices([choice({ isCorrect: 'yes' })], 'choices')).toThrow(/불리언/);
  });
});
