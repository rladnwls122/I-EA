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

// =====================================================================
// 지문 내장 빈칸 마커 (#43 gap 9 — 토익 Part 6)
//
// Part 6는 지문 하나에 번호 붙은 빈칸이 여러 개 있고 각 빈칸이 독립된 문항이다.
// 스키마는 Passage 1 : Question N이라 "이 문항이 지문의 몇 번 빈칸인지"를 담을 자리가
// 없다 — 그래서 **평문 안의 마커**를 규약으로 삼는다.
//
// 규약이 두 겹인 이유:
//   - `[[n]]`  = LLM이 방출하는 **입력 문법**. 타이핑이 단순하고 모델이 헷갈릴 여지가 없다.
//   - `___(n)___` = 우리가 저장/표시하는 **정본 형태**. 학습자에게 그대로 빈칸으로 읽히고,
//     응시 화면(SolveQuestionCard)이 이 형태를 파싱해 "빈칸 n" 배지를 띄운다.
// 조립 시점에 한 번 정규화하고(normalizeBlankMarkers) 그 뒤로는 정본 형태만 돈다.
//
// **노드로 승격하지 않는다**(수식과 다른 판단). 근거:
//   1. 수식은 KaTeX 렌더가 필요해서 노드가 **불가피**했다. 빈칸은 밑줄과 번호뿐이라
//      평문 텍스트 런으로 100% 표현된다 — 노드로 얻는 게 없다.
//   2. 노드로 만들면 sanitize 화이트리스트 + RichContent + TiptapEditor(커스텀 Node 확장,
//      수식과 달리 공식 확장이 없다) + web/lib/prosemirror 락스텝이 필요하다. 그중 하나라도
//      모르는 노드를 만나면 Tiptap은 그 노드를 **조용히 버린다** — 빈칸이 사라진 지문은
//      아예 못 푸는 문항이 된다. 이 저장소가 피하는 실패 모드다.
//   3. 평문이면 에디터·결과 화면·검색·튜터 프롬프트 어디서도 소실되지 않는다(추가 작업 0).
//
// `$...$` 수식 델리미터와의 비충돌:
//   - 마커 문자 집합은 `[`,`]`,`(`,`)`,`_`,숫자뿐이라 `$`를 만들지도 소비하지도 않는다.
//     반대로 수식 토크나이저는 `$`가 없으면 아예 돌지 않는다(splitBlockMath/tokenizeInlineMath 조기 반환).
//   - 그래도 LaTeX 본문 안의 `[[1]]`(예: 행렬 표기)까지 건드리지 않도록, 정규화는
//     **렌더 가능한 수식 구간을 건너뛴다**. 렌더 불가라 어차피 평문으로 강등될 구간은
//     건너뛰지 않는다 — 강등 후 평문이 될 텍스트에 마커가 살아 있으면 안 되기 때문.
// =====================================================================

/** LLM이 방출하는 빈칸 마커 입력 문법. 번호는 1부터. */
const BLANK_INPUT_RE = /\[\[(\d{1,2})\]\]/g;

/** 저장·표시되는 정본 형태. 프런트(web/lib/blank-markers.ts)와 **락스텝**으로 유지한다. */
const BLANK_CANONICAL_RE = /___\((\d{1,2})\)___/g;

/** 번호 n의 정본 마커 문자열. */
export function blankMarker(n: number): string {
  return `___(${n})___`;
}

/**
 * 수식 구간(렌더 가능한 `$$...$$` / `$...$`)을 건너뛰며 나머지 텍스트에만 fn을 적용한다.
 * 수식 판정 규칙을 그대로 재사용하므로, 토크나이저가 나중에 볼 문자열과 같은 시야를 갖는다.
 */
function mapOutsideMath(text: string, fn: (segment: string) => string): string {
  if (!text.includes('$')) return fn(text);

  const out: string[] = [];
  let last = 0;
  const scan = (re: RegExp) => {
    re.lastIndex = 0;
    return re;
  };
  // 별행 수식을 먼저 잘라내고(여러 줄에 걸칠 수 있다), 남은 조각에서 인라인 수식을 본다.
  let m: RegExpExecArray | null;
  const blockRe = scan(BLOCK_MATH_RE);
  while ((m = blockRe.exec(text)) !== null) {
    if (!isRenderableLatex(m[1].trim())) continue; // 강등될 구간 — 평문 취급
    out.push(mapInlineOutsideMath(text.slice(last, m.index), fn), m[0]);
    last = m.index + m[0].length;
  }
  out.push(mapInlineOutsideMath(text.slice(last), fn));
  return out.join('');
}

function mapInlineOutsideMath(text: string, fn: (segment: string) => string): string {
  if (!text.includes('$')) return fn(text);
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_MATH_RE.lastIndex = 0;
  while ((m = INLINE_MATH_RE.exec(text)) !== null) {
    if (!isRenderableLatex(m[1].trim())) continue;
    out.push(fn(text.slice(last, m.index)), m[0]);
    last = m.index + m[0].length;
  }
  out.push(fn(text.slice(last)));
  return out.join('');
}

/**
 * LLM 입력 문법(`[[n]]`)을 정본 마커(`___(n)___`)로 바꾼다.
 * 마커가 없는 텍스트(기존 전 경로)는 **문자 하나도 바뀌지 않는다**.
 */
export function normalizeBlankMarkers(text: string): string {
  if (!text.includes('[[')) return text;
  return mapOutsideMath(text, (seg) =>
    seg.replace(BLANK_INPUT_RE, (_, n: string) => blankMarker(Number(n))),
  );
}

/**
 * 텍스트에 등장하는 빈칸 번호를 **등장 순서대로** 돌려준다(입력 문법·정본 형태 모두 인식).
 * 검증(지문의 빈칸 집합 == 문항 집합)과 프런트 배지 파싱이 같은 함수를 쓴다.
 */
export function findBlankMarkers(text: string): number[] {
  const found: Array<{ at: number; n: number }> = [];
  for (const re of [BLANK_INPUT_RE, BLANK_CANONICAL_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.push({ at: m.index, n: Number(m[1]) });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.n);
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
