import { extractPlainText } from "./prosemirror";

/**
 * 지문 내장 빈칸 마커(#43 gap 9 — 토익 Part 6) 읽기.
 *
 * 백엔드 `src/common/prosemirror/prosemirror.util.ts`와 **락스텝** 규약이다.
 * LLM은 `[[n]]`을 방출하고 서버 조립이 정본 `___(n)___`으로 한 번 정규화한다 —
 * 프런트가 보는 건 항상 정본 형태다.
 *
 * 마커를 노드로 승격하지 않은 이유(서버 주석과 같은 판단): 빈칸은 밑줄과 번호라 평문으로
 * 100% 표현되고, 노드로 만들면 Tiptap이 모르는 노드를 **조용히 버려** 빈칸이 사라진
 * 지문(= 풀 수 없는 문항)이 나올 수 있다.
 *
 * 왜 발문 텍스트에서 읽는가: 문항이 몇 번 빈칸인지는 서버에서 `questions.metadata`에도
 * 남지만, **응시 스냅샷에는 metadata가 실리지 않는다**. 응시 화면이 가진 유일한 근거는
 * 스냅샷 안의 발문·지문 텍스트뿐이다.
 */
const BLANK_MARKER_RE = /___\((\d{1,2})\)___/g;

/** 텍스트에 등장하는 빈칸 번호를 등장 순서대로 돌려준다. */
export function findBlankMarkers(text: string): number[] {
  BLANK_MARKER_RE.lastIndex = 0;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = BLANK_MARKER_RE.exec(text)) !== null) out.push(Number(m[1]));
  return out;
}

/**
 * 발문(ProseMirror doc)이 가리키는 빈칸 번호. 빈칸형이 아니면 null.
 * 번호가 여러 개면(있어선 안 되지만) 첫 번째를 쓴다 — 배지가 없는 것보다 낫다.
 */
export function stemBlankNumber(stem: unknown): number | null {
  if (!stem) return null;
  return findBlankMarkers(extractPlainText(stem))[0] ?? null;
}
