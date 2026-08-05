/**
 * 평문 → ProseMirror 노드 **조립** (KaTeX 의존).
 *
 * 백엔드 규약: src/common/prosemirror/prosemirror.util.ts
 * 규칙(정규식·KaTeX 파스 검증·실패 시 평문 강등)은 백엔드와 **문자 그대로 같아야** 한다.
 *
 * **왜 `prosemirror.ts`에서 갈라져 나왔나:** 파스 검증에 katex가 필요한데, 그 모듈은
 * `extractPlainText` 하나 때문에 대시보드·목록 등 거의 모든 라우트가 import 한다.
 * 같이 두면 수식을 한 글자도 안 쓰는 화면까지 katex(≈85kB)를 내려받는다.
 * 조립은 저작 화면(캔버스·문항 수정 폼)에서만 필요하므로 의존성이 기능을 따라가게 뗐다.
 * 읽기·순회(`extractPlainText`·`walkTextSegments`)는 attrs.latex를 문자열로 읽기만 하므로
 * katex가 필요 없고, 그래서 `prosemirror.ts`에 그대로 남는다.
 */
import katex from 'katex';
// `\ce{H2O}`(과탐 화학식)를 KaTeX가 파스할 수 있게 한다. 백엔드도 같은 모듈을 require한다 —
// 한쪽만 빠지면 같은 문자열을 한쪽은 승격하고 한쪽은 강등해 판정이 갈린다.
import 'katex/contrib/mhchem';

/**
 * 인라인 수식 델리미터. 에디터가 쓰는 공식 확장(@tiptap/extension-mathematics)의
 * `mathMigrationRegex`와 같은 규칙이다. `$100` 같은 통화 표기는 잡지 않는다.
 */
const INLINE_MATH_RE = /\$(?!\d+\$)(.+?)\$(?!\d)/g;

/** 별행 수식. 여러 줄에 걸칠 수 있어 줄 분리보다 **먼저** 잘라낸다. */
const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

/**
 * KaTeX가 실제로 파스할 수 있는지 본다. 실패하면 승격하지 않고 평문 그대로 둔다
 * (안전한 강등) — 깨진 latex를 노드로 만들면 원문이 사라지고 빨간 에러만 남는다.
 */
function isRenderableLatex(latex: string): boolean {
  if (!latex.trim()) return false;
  try {
    katex.renderToString(latex, { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

type MathChunk = { kind: 'text'; text: string } | { kind: 'blockMath'; latex: string };

/** 원문을 별행 수식 조각과 나머지 텍스트 조각으로 가른다. */
function splitBlockMath(text: string): MathChunk[] {
  // 수식이 없는 입력(기존 과목 전부)은 여기서 끝난다 — KaTeX를 아예 부르지 않는다.
  if (!text.includes('$$')) return [{ kind: 'text', text }];

  const chunks: MathChunk[] = [];
  let buffer = '';
  let last = 0;
  BLOCK_MATH_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = BLOCK_MATH_RE.exec(text)) !== null) {
    buffer += text.slice(last, m.index);
    const latex = m[1].trim();
    if (isRenderableLatex(latex)) {
      if (buffer) chunks.push({ kind: 'text', text: buffer });
      buffer = '';
      chunks.push({ kind: 'blockMath', latex });
    } else {
      buffer += m[0]; // 강등: 델리미터째로 평문에 되돌린다
    }
    last = m.index + m[0].length;
  }

  buffer += text.slice(last);
  if (buffer) chunks.push({ kind: 'text', text: buffer });
  return chunks;
}

/** 한 줄 안의 `$...$`를 inlineMath 노드로 승격한다. 나머지는 text 런으로 남는다. */
function tokenizeInlineMath(line: string): any[] {
  if (!line.includes('$')) return [{ type: 'text', text: line }];

  const out: any[] = [];
  let buffer = '';
  let last = 0;
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };
  INLINE_MATH_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = INLINE_MATH_RE.exec(line)) !== null) {
    buffer += line.slice(last, m.index);
    const latex = m[1].trim();
    if (isRenderableLatex(latex)) {
      flush();
      out.push({ type: 'inlineMath', attrs: { latex } });
    } else {
      buffer += m[0]; // 강등
    }
    last = m.index + m[0].length;
  }

  buffer += line.slice(last);
  flush();
  return out;
}

/**
 * 평문을 블록 노드 배열로 조립한다. buildRichDoc/buildRichBlocks의 공통 몸통.
 *
 * 수식이 없는 입력의 출력은 수식 도입 이전과 **바이트 단위로 동일**하다
 * (줄 분리 규칙 `split('\n').filter(Boolean)`을 그대로 유지한다).
 */
function buildBlocks(text: string): any[] {
  const blocks: any[] = [];
  for (const chunk of splitBlockMath(text)) {
    if (chunk.kind === 'blockMath') {
      blocks.push({ type: 'blockMath', attrs: { latex: chunk.latex } });
      continue;
    }
    for (const line of chunk.text.split('\n').filter(Boolean)) {
      const inline = tokenizeInlineMath(line);
      blocks.push(inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' });
    }
  }
  return blocks;
}

/**
 * 평문 텍스트를 ProseMirror doc 노드로 변환합니다.
 * 빈 줄은 무시되고, `$...$`/`$$...$$`는 math 노드로 승격됩니다.
 *
 * @param text - 변환할 평문 텍스트
 * @returns ProseMirror doc JSON 객체
 */
export function buildRichDoc(text: string): any {
  return { type: 'doc', content: buildBlocks(text) };
}

/**
 * 평문 텍스트를 ProseMirror 블록 노드 배열로 변환합니다.
 * doc 래퍼 없이 블록 노드만 반환합니다.
 *
 * @param text - 변환할 평문 텍스트
 * @returns ProseMirror 블록 노드 배열
 */
export function buildRichBlocks(text: string): any[] {
  return buildBlocks(text);
}
