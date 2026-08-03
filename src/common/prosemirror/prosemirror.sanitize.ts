/**
 * 저장되는 ProseMirror/Tiptap JSON의 구조 검증(화이트리스트).
 *
 * **왜 필요한가:** 예전에는 stem/choices/explanation/passage가 `@IsObject()`·
 * `@IsArray()`만 통과하면 그대로 DB에 들어갔다. 즉 클라이언트가 임의의 노드 타입과
 * 임의의 attrs를 심을 수 있었고, 그 JSON을 나중에 에디터/렌더러가 그대로 해석한다.
 * 지금은 프런트에 `dangerouslySetInnerHTML`이 없어 즉시 터지지는 않지만,
 * 렌더러가 바뀌는 순간 저장형 XSS가 되는 구조다. 저장 시점에 막는 게 맞다.
 * (question-content.dto의 "상세 노드 검증은 별도 파이프에서 확장" 주석이 예고한 그 지점.)
 *
 * 허용 집합은 프런트 에디터가 실제로 쓰는 Tiptap v3 StarterKit 기준이다
 * (v3 StarterKit은 Link·Underline을 기본 포함한다 — 둘 다 아래 목록에 있다).
 * 에디터에 확장을 추가하면 여기도 같이 넓혀야 한다 — 넓히지 않으면 저장이 400으로 막힌다.
 */

/** 노드 타입 → 허용 attrs 키 목록. 목록에 없는 attrs 키는 거부한다. */
const ALLOWED_NODES: Record<string, readonly string[]> = {
  doc: [],
  paragraph: ['textAlign'],
  text: [],
  heading: ['level', 'textAlign'],
  bulletList: [],
  orderedList: ['start', 'type'],
  listItem: [],
  blockquote: [],
  codeBlock: ['language'],
  horizontalRule: [],
  hardBreak: [],
  image: ['src', 'alt', 'title', 'width', 'height'],
};

/** 마크 타입 → 허용 attrs 키 목록. */
const ALLOWED_MARKS: Record<string, readonly string[]> = {
  bold: [],
  italic: [],
  strike: [],
  underline: [],
  code: [],
  subscript: [],
  superscript: [],
  // Tiptap v3 StarterKit의 Link는 href/target/rel/class를 노드 attrs로 갖는다.
  link: ['href', 'target', 'rel', 'class'],
};

/** URL을 실을 수 있는 자리에서 허용하는 스킴. `javascript:`·`data:` 차단이 핵심. */
const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:'];

/** 중첩 깊이 상한. 깊은 재귀 JSON으로 스택을 터뜨리는 걸 막는다. */
const MAX_DEPTH = 50;

/** 문서 하나가 가질 수 있는 노드 수 상한(저장/렌더 비용 폭주 방지). */
const MAX_NODES = 5_000;

export class ProseMirrorValidationError extends Error {}

interface Ctx {
  count: number;
}

/**
 * 노드 트리를 검증하고, 허용된 것만 남긴 **새 트리**를 돌려준다.
 * 허용되지 않은 노드/마크 타입을 만나면 조용히 지우지 않고 throw 한다
 * (에디터 확장을 추가했는데 내용이 소리 없이 사라지는 게 더 나쁜 실패다).
 */
export function sanitizeProseMirrorNode(input: unknown, field = 'content'): unknown {
  const ctx: Ctx = { count: 0 };
  return walk(input, field, 0, ctx);
}

/** 블록 노드 배열(choices[].content, explanation 등) 용. */
export function sanitizeProseMirrorBlocks(input: unknown, field = 'content'): unknown[] {
  if (!Array.isArray(input)) {
    throw new ProseMirrorValidationError(`${field}: 블록 노드 배열이어야 합니다.`);
  }
  const ctx: Ctx = { count: 0 };
  return input.map((node, i) => walk(node, `${field}[${i}]`, 0, ctx));
}

function walk(input: unknown, path: string, depth: number, ctx: Ctx): unknown {
  if (depth > MAX_DEPTH) {
    throw new ProseMirrorValidationError(`${path}: 노드 중첩이 너무 깊습니다(최대 ${MAX_DEPTH}).`);
  }
  if (++ctx.count > MAX_NODES) {
    throw new ProseMirrorValidationError(`노드 수가 상한(${MAX_NODES})을 넘었습니다.`);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProseMirrorValidationError(`${path}: 노드는 객체여야 합니다.`);
  }

  const node = input as Record<string, unknown>;
  const type = node.type;
  if (typeof type !== 'string' || !(type in ALLOWED_NODES)) {
    throw new ProseMirrorValidationError(
      `${path}: 허용되지 않은 노드 타입입니다(${String(type)}).`,
    );
  }

  const out: Record<string, unknown> = { type };

  // text 노드는 text가 문자열이어야 하고 자식을 갖지 않는다.
  if (type === 'text') {
    if (typeof node.text !== 'string') {
      throw new ProseMirrorValidationError(`${path}: text 노드에는 문자열 text가 필요합니다.`);
    }
    out.text = node.text;
  }

  const attrs = pickAttrs(node.attrs, ALLOWED_NODES[type], `${path}.attrs`);
  if (attrs) {
    // image.src는 렌더 시 URL로 쓰이므로 스킴을 강제한다.
    if (type === 'image' && attrs.src !== undefined) {
      assertSafeUrl(attrs.src, `${path}.attrs.src`);
    }
    out.attrs = attrs;
  }

  const marks = sanitizeMarks(node.marks, `${path}.marks`);
  if (marks) out.marks = marks;

  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) {
      throw new ProseMirrorValidationError(`${path}.content: 배열이어야 합니다.`);
    }
    out.content = node.content.map((child, i) => walk(child, `${path}.content[${i}]`, depth + 1, ctx));
  }

  return out;
}

function sanitizeMarks(input: unknown, path: string): Record<string, unknown>[] | null {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) {
    throw new ProseMirrorValidationError(`${path}: 배열이어야 합니다.`);
  }

  return input.map((raw, i) => {
    const markPath = `${path}[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ProseMirrorValidationError(`${markPath}: 마크는 객체여야 합니다.`);
    }
    const mark = raw as Record<string, unknown>;
    const type = mark.type;
    if (typeof type !== 'string' || !(type in ALLOWED_MARKS)) {
      throw new ProseMirrorValidationError(
        `${markPath}: 허용되지 않은 마크 타입입니다(${String(type)}).`,
      );
    }

    const out: Record<string, unknown> = { type };
    const attrs = pickAttrs(mark.attrs, ALLOWED_MARKS[type], `${markPath}.attrs`);
    if (attrs) {
      // link.href가 `javascript:`면 클릭 한 번에 스크립트가 돈다 — 여기서 끊는다.
      if (type === 'link' && attrs.href !== undefined) {
        assertSafeUrl(attrs.href, `${markPath}.attrs.href`);
      }
      out.attrs = attrs;
    }
    return out;
  });
}

/** 허용 키만 남긴 attrs 사본. 허용 목록에 없는 키가 있으면 거부한다. */
function pickAttrs(
  input: unknown,
  allowed: readonly string[],
  path: string,
): Record<string, unknown> | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ProseMirrorValidationError(`${path}: 객체여야 합니다.`);
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // Tiptap은 미설정 attr을 null로 실어 보낸다 — 조용히 흘린다.
    if (value === null || value === undefined) continue;
    if (!allowed.includes(key)) {
      throw new ProseMirrorValidationError(`${path}: 허용되지 않은 속성입니다(${key}).`);
    }
    if (typeof value === 'object') {
      throw new ProseMirrorValidationError(`${path}.${key}: 원시 값이어야 합니다.`);
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** http/https/mailto만 통과. 상대 경로는 허용하지 않는다(스킴을 판정할 수 없으므로). */
function assertSafeUrl(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    throw new ProseMirrorValidationError(`${path}: 문자열이어야 합니다.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProseMirrorValidationError(`${path}: 절대 URL이어야 합니다.`);
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
    throw new ProseMirrorValidationError(
      `${path}: 허용되지 않은 URL 스킴입니다(${parsed.protocol}).`,
    );
  }
}
