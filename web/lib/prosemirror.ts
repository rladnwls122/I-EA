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
 * 내부 공통 visitor — extractPlainText와 walkTextSegments가 반드시 같은 순회를
 * 쓰도록 하는 단일 출처. 블록 사이는 blockGap(평문 '\n' 1글자), 텍스트 노드는 text.
 * 이 일치가 주석 앵커(평문 오프셋) 모델의 전제다.
 */
function visitTextNodes(
  doc: any,
  visitor: { text: (t: string) => void; blockGap: () => void },
): void {
  if (!doc || !doc.content || !Array.isArray(doc.content)) return;
  doc.content.forEach((node: any, i: number) => {
    if (i > 0) visitor.blockGap();
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (child.text) visitor.text(child.text);
      }
    }
  });
}

/**
 * ProseMirror doc JSON에서 평문 텍스트를 추출합니다.
 * 각 블록 노드는 줄바꿈(\n)으로 구분됩니다.
 */
export function extractPlainText(doc: any): string {
  let out = '';
  visitTextNodes(doc, {
    text: (t) => {
      out += t;
    },
    blockGap: () => {
      out += '\n';
    },
  });
  return out;
}

/** 평문 오프셋이 매핑된 텍스트 세그먼트. start/end는 extractPlainText 기준. */
export interface TextSegment {
  text: string;
  start: number;
  end: number;
  blockIndex: number;
}

/**
 * doc을 순회하며 텍스트 세그먼트와 평문 오프셋 매핑을 산출합니다.
 * extractPlainText와 같은 visitor를 쓰므로 오프셋이 항상 일치합니다.
 */
export function walkTextSegments(doc: any): TextSegment[] {
  const segments: TextSegment[] = [];
  let offset = 0;
  let blockIndex = 0;
  visitTextNodes(doc, {
    text: (t) => {
      segments.push({ text: t, start: offset, end: offset + t.length, blockIndex });
      offset += t.length;
    },
    blockGap: () => {
      offset += 1;
      blockIndex += 1;
    },
  });
  return segments;
}
