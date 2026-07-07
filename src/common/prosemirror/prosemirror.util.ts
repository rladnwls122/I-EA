/**
 * 스키마 3.6.1의 stem/choices[].content/explanation JSON 노드 구조(ProseMirror/Tiptap 계열)를
 * 앱 코드에서 안전하게 생성/파싱하기 위한 유틸.
 *
 * LLM에는 "평문 + 빈칸 토큰"이라는 단순 계약만 시키고, 실제 노드 트리 조립은
 * 우리 코드가 소유한다. 이렇게 해야 LLM 출력이 흔들려도 저장 포맷이 깨지지 않는다.
 */

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Array<Record<string, unknown>>;
};

/** SHORT_ANSWER 발문에서 빈칸 위치를 나타내는 토큰. LLM이 이 자리에 삽입한다. */
export const BLANK_TOKEN = '[[blank]]';

/**
 * 평문 텍스트를 doc 노드로 변환한다.
 * - 줄바꿈(\n)은 문단(paragraph) 분리로 취급
 * - BLANK_TOKEN 자리에는 blank atom 노드를 삽입하고, blankAnswers 배열에서
 *   순서대로 정답을 채운다(b1, b2, ...). 정답은 응시용 API에서 마스킹 대상.
 */
export function buildRichDoc(text: string, blankAnswers: string[] = []): PMNode {
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  let blankIdx = 0;

  const content: PMNode[] = paragraphs.map((para) => {
    const segments = para.split(BLANK_TOKEN);
    const inline: PMNode[] = [];

    segments.forEach((seg, i) => {
      if (seg) inline.push({ type: 'text', text: seg });
      // 마지막 세그먼트 뒤에는 빈칸을 넣지 않는다
      if (i < segments.length - 1) {
        const answer = blankAnswers[blankIdx] ?? '';
        inline.push({
          type: 'blank',
          attrs: { blankId: `b${blankIdx + 1}`, answer, widthCh: Math.max(4, answer.length + 1) },
        });
        blankIdx++;
      }
    });

    return { type: 'paragraph', content: inline.length ? inline : [{ type: 'text', text: '' }] };
  });

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/**
 * choices[].content / choices[].explanation / questions.explanation 용.
 * 이들은 doc 래퍼 없이 "블록 노드 배열" 형태로 저장된다(3.6.1 예시 참고).
 */
export function buildRichBlocks(text: string): PMNode[] {
  return buildRichDoc(text).content ?? [];
}

/**
 * 노드 트리에서 순수 텍스트만 뽑아낸다. search_text 캐시 구축과
 * (선택적으로) blank 정답까지 검색 대상에 포함시키는 데 쓴다.
 */
export function extractPlainText(node: PMNode | PMNode[] | null | undefined): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join(' ');

  const parts: string[] = [];
  if (node.text) parts.push(node.text);
  if (node.type === 'blank' && typeof node.attrs?.answer === 'string') {
    parts.push(node.attrs.answer as string);
  }
  if (node.content) parts.push(extractPlainText(node.content));

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
