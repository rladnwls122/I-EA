/**
 * ProseMirror / Tiptap JSON 유틸리티 — 읽기·순회·구조 변환.
 *
 * 백엔드 규약: src/common/prosemirror/prosemirror.util.ts
 * 이 파일의 규약은 백엔드와 반드시 일치해야 합니다.
 *
 * - question.stem, choices[].content/explanation, passage.content,
 *   explanation 등은 모두 Tiptap/ProseMirror JSON으로 저장됩니다.
 * - LLM은 항상 평문(plain text)만 반환하며, 평문 → 노드 **조립**은
 *   `prosemirror-assemble.ts`가 맡습니다(KaTeX 의존이라 분리돼 있습니다).
 * - 수식(#35)은 `inlineMath`/`blockMath` atom 노드로 저장되고, 여기서는
 *   `$latex$`/`$$latex$$` 평문으로 되돌려 읽습니다 — atom이라 그냥 순회하면
 *   수식이 통째로 사라집니다(search_text·튜터 프롬프트·응시 평문화 전부).
 */

/* ────────────────────────────────────────────────────────────────────────
 * 구조 보존 변환 (doc ↔ 블록 배열)
 *
 * 저장 포맷이 필드마다 다르다:
 *   - `stem`, `passage.content` → doc 노드
 *   - `explanation`, `choices[].explanation` → doc 래퍼 없는 블록 노드 배열
 * 에디터(Tiptap)는 항상 doc을 다루므로 경계에서 감싸고 벗기는 변환이 필요하다.
 *
 * **중요**: 이 변환은 평문을 거치지 않는다. 예전에는 저장·복원 양쪽에서
 * `extractPlainText → buildRichBlocks` 왕복을 태워서, 굵게/목록/제목 같은 서식이
 * 저장 한 번에 전부 증발했다("편집은 rich, 저장은 평문"인 자기모순 구조).
 * 이미지·수식 삽입(#35)은 이 왕복이 남아 있으면 아예 얹을 수 없다.
 * 아래 두 함수는 노드 트리를 **그대로** 옮긴다 — 감싸기/벗기기만 한다.
 * ──────────────────────────────────────────────────────────────────────── */

/** 블록 배열이든 doc이든 doc 노드로 세운다. 내용은 손대지 않는다. */
export function blocksToDoc(value: any): any {
  if (Array.isArray(value)) return { type: 'doc', content: value };
  if (value && value.type === 'doc') return value;
  // 단일 블록 노드가 온 경우까지 방어(손상 데이터).
  if (value && value.type) return { type: 'doc', content: [value] };
  // 조립 모듈을 부르지 않는다 — 여기서 부르면 이 파일이 다시 katex를 끌고 온다.
  return { type: 'doc', content: [] };
}

/** doc이든 블록 배열이든 블록 노드 배열로 벗긴다. 내용은 손대지 않는다. */
export function docToBlocks(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.content)) return value.content;
  return [];
}

/**
 * 실질적으로 비어 있는지 판정한다. `extractPlainText(v).trim()` 대신 쓴다.
 *
 * 텍스트만 보면 안 되는 이유: 이미지·구분선·표는 텍스트가 0글자여도 내용이 있다.
 * Phase 2에서 이미지 삽입이 붙으면 텍스트 기준 판정은 "이미지만 있는 해설"을
 * 빈 값으로 보고 저장에서 통째로 날린다. 지금 미리 노드 기준으로 판정한다.
 */
// 수식 노드도 여기 들어가야 한다. atom이라 텍스트가 0글자인데, 빠뜨리면 "수식만 있는 발문"이
// 빈 값으로 판정돼 저장에서 통째로 날아간다.
const NON_TEXT_CONTENT_NODES = new Set([
  'image',
  'horizontalRule',
  'table',
  'inlineMath',
  'blockMath',
]);

export function isRichEmpty(value: any): boolean {
  let hasContent = false;
  const walk = (node: any): void => {
    if (hasContent || !node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node.text === 'string' && node.text.trim()) {
      hasContent = true;
      return;
    }
    if (node.type && NON_TEXT_CONTENT_NODES.has(node.type)) {
      hasContent = true;
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(Array.isArray(value) ? value : value?.content ?? value);
  return !hasContent;
}

/**
 * 평문 편집기에서 "안 고친 필드"의 서식을 지키는 장치.
 *
 * 선지 입력·문항 상세 수정 폼은 아직 평문 `<input>`/`<textarea>`다. 저장할 때 무조건
 * `buildRichDoc(평문)`으로 다시 지으면, 다른 편집기(캔버스 Tiptap)에서 넣은 서식이
 * 이 폼을 한 번 들르는 것만으로 사라진다. 편집기 일원화(#41 Phase 3) 전까지의 방어다.
 *
 * @param source 불러올 때의 원본 노드(doc 또는 블록 배열)
 * @param edited 화면에서 편집된 평문
 * @returns 텍스트가 그대로면 원본 노드, 달라졌으면 null(호출부가 평문으로 새로 짓는다)
 */
export function keepIfUnchanged(source: any, edited: string): any | null {
  if (!source) return null;
  const asDoc = Array.isArray(source) ? { type: 'doc', content: source } : source;
  return extractPlainText(asDoc) === edited ? source : null;
}

/**
 * math atom 노드를 평문으로 되돌린다. 수식 노드가 아니면 null.
 *
 * math 노드는 atom이라 `text`도 `content`도 없다 — 이 분기가 없으면 순회가 조용히
 * 건너뛰어 수식이 통째로 증발한다(오답노트 검색·주석 평문·미리보기 전부).
 * 델리미터를 포함한 문자열을 돌려주는 건 백엔드 `extractPlainText`와 같은 규약이고,
 * 그래야 `buildRichDoc(extractPlainText(doc))`이 수식 보존 왕복이 된다.
 */
function mathPlainText(node: any): string | null {
  if (node?.type !== 'inlineMath' && node?.type !== 'blockMath') return null;
  const latex = node.attrs?.latex;
  if (typeof latex !== 'string' || !latex) return '';
  return node.type === 'blockMath' ? `$$${latex}$$` : `$${latex}$`;
}

/**
 * 내부 공통 visitor — extractPlainText와 walkTextSegments가 반드시 같은 순회를
 * 쓰도록 하는 단일 출처. 블록 사이는 blockGap(평문 '\n' 1글자), 텍스트 노드는 text.
 * 이 일치가 주석 앵커(평문 오프셋) 모델의 전제다.
 */
function visitTextNodes(
  doc: any,
  visitor: {
    /**
     * `latex`가 함께 오면 이 조각은 수식 노드에서 나온 것이다. 평문 값(`$latex$`)은
     * 그대로 오프셋을 차지하고, 원본 latex는 **화면이 KaTeX로 그릴 수 있게** 곁들인다.
     * 이 값이 없으면 오답노트 상세는 수식을 `$x^2$` 원문으로 보여줄 수밖에 없다.
     */
    text: (t: string, latex?: string) => void;
    blockGap: () => void;
  },
): void {
  // choices[].content·explanation은 doc 래퍼 없는 블록 배열(buildRichBlocks)로 저장된다.
  // 배열이 들어오면 doc.content처럼 취급해 순회한다 — 안 그러면 선지/해설이 빈 문자열로
  // 읽혀 화면에서 "선지·해설이 깨져" 보인다.
  const root = Array.isArray(doc) ? { content: doc } : doc;
  if (!root || !root.content || !Array.isArray(root.content)) return;

  /**
   * 깊이 순회한다. 예전에는 두 단계(root.content[].content[].text)만 봐서
   * 목록·인용처럼 한 겹 더 들어간 내용이 통째로 빈 문자열이 됐다
   * (bulletList → listItem → paragraph → text 는 네 단계다).
   *
   * #41 Phase 1 이전에는 저장 경로가 모든 걸 paragraph+text로 납작하게 만들어서
   * 이 한계가 드러나지 않았다. 이제 중첩 구조가 실제로 저장되므로 순회도 따라가야 한다.
   *
   * **오프셋 호환**: 평평한 문서(= 기존에 저장된 모든 문서)에서는 결과가 예전과
   * 완전히 같다. 달라지는 건 예전에 `''`를 내놓던 중첩 문서뿐이라, 그 위에 찍힌
   * 주석 앵커는 애초에 존재할 수 없었다. 그래서 이 변경은 기존 주석을 어긋내지 않는다.
   *
   * 블록 경계('\n')는 **텍스트가 아닌 형제** 앞에만 넣는다. 한 문단 안의 인라인
   * 텍스트 조각들(굵게/기울임으로 쪼개진 것)은 붙여야 하기 때문이다.
   *
   * 수식(#35)은 `inlineMath`를 텍스트 조각과 동급으로 취급한다 — 문단 중간에 있으므로
   * 앞에 '\n'을 끼우면 안 된다. `blockMath`는 이름 그대로 블록이라 다른 블록과 같다.
   * 어느 쪽이든 `$latex$` 길이만큼 평문 오프셋을 차지하고, 그 값이 visitor를 통해
   * extractPlainText·walkTextSegments 양쪽에 똑같이 전달되므로 오프셋은 자동으로 맞는다.
   */
  const walk = (nodes: any[]): void => {
    nodes.forEach((node: any, i: number) => {
      if (!node) return;
      const math = mathPlainText(node);
      const isTextLeaf = typeof node.text === 'string' || node.type === 'inlineMath';
      if (i > 0 && !isTextLeaf) visitor.blockGap();
      if (math !== null) {
        if (math) visitor.text(math, node.attrs?.latex);
        return;
      }
      if (isTextLeaf) {
        if (node.text) visitor.text(node.text);
        return;
      }
      if (Array.isArray(node.content)) walk(node.content);
    });
  };

  walk(root.content);
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
  /** 수식 노드에서 나온 조각이면 원본 latex. 화면이 KaTeX로 그릴 때 쓴다. */
  latex?: string;
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
    text: (t, latex) => {
      segments.push({
        text: t,
        start: offset,
        end: offset + t.length,
        blockIndex,
        ...(latex ? { latex } : {}),
      });
      offset += t.length;
    },
    blockGap: () => {
      offset += 1;
      blockIndex += 1;
    },
  });
  return segments;
}
