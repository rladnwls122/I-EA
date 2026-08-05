/**
 * 스키마의 stem/choices[].content/explanation JSON 노드 구조(ProseMirror/Tiptap 계열)를
 * 앱 코드에서 안전하게 생성/파싱하기 위한 유틸.
 *
 * LLM에는 "평문"이라는 단순 계약만 시키고, 실제 노드 트리 조립은
 * 우리 코드가 소유한다. 이렇게 해야 LLM 출력이 흔들려도 저장 포맷이 깨지지 않는다.
 *
 * **수식(#35)도 같은 계약이다.** LLM은 여전히 평문만 돌려준다 — 다만 수식을
 * `$...$`(인라인)/`$$...$$`(별행) 델리미터로 감싸 오고, math 노드로의 승격은 여기서 한다.
 * 델리미터 문법은 프런트 에디터가 쓰는 공식 확장(@tiptap/extension-mathematics)의
 * `mathMigrationRegex`와 같은 규칙이라, 에디터의 `$` 마이그레이션과 서버 조립이
 * 같은 문법을 본다.
 */
import katex from 'katex';
// `\ce{H2O}` 같은 화학식(과탐)을 KaTeX가 파스할 수 있게 한다. 이 부수효과 import가 없으면
// `\ce{...}`가 "파스 실패"로 판정돼 수식이 평문으로 강등된다.
// 렌더하는 프런트(web)도 같은 모듈을 따로 import해야 짝이 맞는다.
import 'katex/contrib/mhchem';

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Array<Record<string, unknown>>;
};

/**
 * 인라인 수식 델리미터. 공식 확장의 `mathMigrationRegex`를 그대로 차용했다.
 * `$100`처럼 숫자에 붙은 달러 기호(통화)는 잡지 않는다.
 */
const INLINE_MATH_RE = /\$(?!\d+\$)(.+?)\$(?!\d)/g;

/**
 * 별행 수식. 여러 줄에 걸칠 수 있어(`$$\n x \n$$`) 문단 분리보다 **먼저** 잘라낸다.
 * 문단 분리(`\n+`)를 먼저 하면 여는 `$$`와 닫는 `$$`가 다른 문단으로 찢어진다.
 */
const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

/**
 * KaTeX가 실제로 파스할 수 있는 수식인지 본다.
 *
 * 실패하면 승격하지 않고 원문 텍스트를 그대로 둔다(안전한 강등). LLM 출력이 흔들려도
 * 저장 포맷을 깨지 않는다는 이 파일의 원칙과 같다 — 깨진 latex를 노드로 만들면
 * 화면에 빨간 에러 문자열만 남고 원문은 사라진다.
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

type Chunk = { kind: 'text'; text: string } | { kind: 'blockMath'; latex: string };

/** 원문을 별행 수식 조각과 나머지 텍스트 조각으로 가른다. */
function splitBlockMath(text: string): Chunk[] {
  // 수식이 없는 텍스트(국어·영어 등 기존 과목 전부)는 여기서 끝난다 — KaTeX를 부르지 않는다.
  if (!text.includes('$$')) return [{ kind: 'text', text }];

  const chunks: Chunk[] = [];
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

/** 한 문단 안의 `$...$`를 inlineMath 노드로 승격한다. 나머지는 text 런으로 남는다. */
function tokenizeInlineMath(line: string): PMNode[] {
  if (!line.includes('$')) return [{ type: 'text', text: line }];

  const out: PMNode[] = [];
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
 * 평문 텍스트를 doc 노드로 변환한다.
 * - 줄바꿈(\n)은 문단(paragraph) 분리로 취급
 * - `$...$`/`$$...$$`는 math 노드로 승격(파스 실패 시 평문 유지)
 *
 * 수식이 없는 입력의 출력은 수식 도입 이전과 **바이트 단위로 동일**하다.
 */
export function buildRichDoc(text: string): PMNode {
  const content: PMNode[] = [];

  for (const chunk of splitBlockMath(text)) {
    if (chunk.kind === 'blockMath') {
      content.push({ type: 'blockMath', attrs: { latex: chunk.latex } });
      continue;
    }
    const paragraphs = chunk.text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    for (const para of paragraphs) {
      const inline = tokenizeInlineMath(para);
      content.push(inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' });
    }
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/**
 * choices[].content / choices[].explanation / questions.explanation 용.
 * 이들은 doc 래퍼 없이 "블록 노드 배열" 형태로 저장된다.
 */
export function buildRichBlocks(text: string): PMNode[] {
  return buildRichDoc(text).content ?? [];
}

/**
 * 노드 트리에서 순수 텍스트만 뽑아낸다. search_text 캐시 구축에 쓴다.
 *
 * **math 노드는 atom이라 `text`도 `content`도 없다.** 분기를 두지 않으면 수식이 통째로
 * 증발해서 검색·튜터 프롬프트·응시 평문화에서 사라진다. 델리미터째로 역직렬화해
 * `buildRichDoc(extractPlainText(doc))`가 수식 보존 왕복이 되게 한다.
 * 프런트(web/lib/prosemirror.ts)의 같은 함수와 **락스텝으로** 유지한다.
 */
export function extractPlainText(node: PMNode | PMNode[] | null | undefined): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join(' ');

  const parts: string[] = [];
  const latex = node.attrs?.latex;
  if (typeof latex === 'string' && latex) {
    if (node.type === 'inlineMath') parts.push(`$${latex}$`);
    else if (node.type === 'blockMath') parts.push(`$$${latex}$$`);
  }
  if (node.text) parts.push(node.text);
  if (node.content) parts.push(extractPlainText(node.content));

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
