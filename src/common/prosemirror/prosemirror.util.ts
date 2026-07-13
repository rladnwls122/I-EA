/**
 * 스키마의 stem/choices[].content/explanation JSON 노드 구조(ProseMirror/Tiptap 계열)를
 * 앱 코드에서 안전하게 생성/파싱하기 위한 유틸.
 *
 * LLM에는 "평문"이라는 단순 계약만 시키고, 실제 노드 트리 조립은
 * 우리 코드가 소유한다. 이렇게 해야 LLM 출력이 흔들려도 저장 포맷이 깨지지 않는다.
 */

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Array<Record<string, unknown>>;
};

/**
 * 평문 텍스트를 doc 노드로 변환한다.
 * - 줄바꿈(\n)은 문단(paragraph) 분리로 취급
 */
export function buildRichDoc(text: string): PMNode {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const content: PMNode[] = paragraphs.map((para) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: para }],
  }));

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
 */
export function extractPlainText(node: PMNode | PMNode[] | null | undefined): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join(' ');

  const parts: string[] = [];
  if (node.text) parts.push(node.text);
  if (node.content) parts.push(extractPlainText(node.content));

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
