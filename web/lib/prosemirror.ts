/**
 * ProseMirror / Tiptap JSON 유틸리티
 *
 * 백엔드 규약: src/common/prosemirror/prosemirror.util.ts
 * 이 파일의 규약은 백엔드와 반드시 일치해야 합니다.
 *
 * - question.stem, choices[].content/explanation, passage.content,
 *   explanation 등은 모두 Tiptap/ProseMirror JSON으로 저장됩니다.
 * - LLM은 항상 평문(plain text)만 반환하며, 이 유틸을 통해
 *   ProseMirror 노드 트리로 변환합니다.
 */

/**
 * 평문 텍스트를 ProseMirror doc 노드로 변환합니다.
 * 빈 줄은 무시됩니다.
 *
 * @param text - 변환할 평문 텍스트
 * @returns ProseMirror doc JSON 객체
 */
export function buildRichDoc(text: string): any {
  return {
    type: 'doc',
    content: text
      .split('\n')
      .filter(Boolean)
      .map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
  };
}

/**
 * 평문 텍스트를 ProseMirror paragraph 노드 배열로 변환합니다.
 * doc 래퍼 없이 블록 노드만 반환합니다.
 *
 * @param text - 변환할 평문 텍스트
 * @returns ProseMirror paragraph 노드 배열
 */
export function buildRichBlocks(text: string): any[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    }));
}

/**
 * ProseMirror doc JSON에서 평문 텍스트를 추출합니다.
 * 각 블록 노드는 줄바꿈(\n)으로 구분됩니다.
 *
 * @param doc - ProseMirror doc JSON 객체
 * @returns 추출된 평문 텍스트
 */
export function extractPlainText(doc: any): string {
  if (!doc || !doc.content) return '';
  return doc.content
    .map((node: any) => {
      if (node.content) {
        return node.content.map((child: any) => child.text || '').join('');
      }
      return '';
    })
    .join('\n');
}
