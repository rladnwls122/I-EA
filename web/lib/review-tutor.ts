/**
 * 오답 복습 AI 코치 (#40) — SSE 클라이언트.
 *
 * 서버 계약은 authoring-chat과 동일한 SSE 프레임(`data: {delta}` … `data: {done}`,
 * 실패는 `event: error`)이라 소비 방식을 그대로 맞춘다. 다른 건 엔드포인트와
 * 요청 바디뿐이다.
 *
 * 응시 중 튜터(`POST /tutor/chat`)와 **다른 엔드포인트**를 쓴다. 그쪽은 정답 발설이
 * 금지된 상태고 이쪽은 정답을 설명하는 게 역할이라, 서버에서 프롬프트·인가가
 * 갈려 있다. 클라이언트에서 하나로 합치지 마라.
 */
import katex from 'katex';
// `\ce{H2O}`(과탐 화학식)를 KaTeX가 파스할 수 있게 한다. 조립(web/lib/prosemirror-assemble.ts)·
// 백엔드가 모두 같은 모듈을 부수효과로 import한다 — 여기만 빠지면 같은 화학식을
// 문항에서는 그리고 튜터 답변에서는 평문으로 강등해 판정이 갈린다.
import 'katex/contrib/mhchem';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface ReviewTutorTurn {
  role: 'user' | 'model';
  text: string;
}

// =====================================================================
// 튜터 답변의 수식 구간 분해 (#35 후속)
//
// 튜터는 이제 `$...$`/`$$...$$`로 감싼 LaTeX를 쓴다(tutor-review.prompt.ts).
// 화면에 날것으로 보이지 않게 하려면 그 구간을 KaTeX로 그려야 한다.
//
// **왜 조립(buildRichDoc)을 태우지 않는가.** 저장 경로는 평문 → ProseMirror 노드로
// 조립해 RichContent로 그린다. 튜터 답변에도 같은 길을 쓰면 규칙이 한곳(조립)에
// 모이지만 세 가지가 걸린다:
//   1. 조립은 빈 줄을 버린다(`split('\n').filter(Boolean)`). 이 프롬프트는 "문단을
//      짧게 나눈다"를 지시하고 패널은 `whitespace-pre-wrap`으로 그 줄바꿈을 그대로
//      보여준다 — 조립을 태우면 **수식이 한 글자도 없는 기존 답변의 생김새부터** 바뀐다.
//   2. 델타마다 누적 전체를 다시 조립해야 한다. 조립은 후보 구간마다 KaTeX 파스를
//      돌려 검증하므로(한 응답에 델타 수십 개) 비용이 수식 개수 × 델타 수로 겹친다.
//      여기서도 델타마다 다시 자르지만, 수식이 없는 답변은 `$` 조기 반환으로 끝난다.
//   3. 조립 결과는 **저장 포맷**이다. 튜터 답변은 저장되지 않는 휘발성 텍스트라
//      sanitize 화이트리스트·주석 오프셋의 전제를 짊어질 이유가 없다.
// 그래서 평문은 평문 그대로 두고 수식 구간만 잘라낸다.
//
// **규칙이 갈리지 않게 하는 장치:** 델리미터 정규식과 "파스 실패 시 평문 강등"은
// 조립과 문자 그대로 같다(이 저장소는 백엔드 prosemirror.util.ts ↔ web
// prosemirror-assemble.ts도 같은 방식으로 락스텝 복제한다). 실제로 같은지는
// review-tutor.test.ts가 buildRichBlocks의 승격 결과와 대조해 지킨다.
// 렌더 자체는 RichContent의 math 노드 경로에 태운다 — KaTeX 주입 경계를 늘리지 않는다.
// =====================================================================

/** 인라인 수식. `$100` 같은 통화 표기는 잡지 않는다(조립과 동일). */
const INLINE_MATH_RE = /\$(?!\d+\$)(.+?)\$(?!\d)/g;

/** 별행 수식. 여러 줄에 걸칠 수 있어 인라인보다 **먼저** 잘라낸다(조립과 동일). */
const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

/**
 * KaTeX가 실제로 파스할 수 있는지 본다. 실패하면 승격하지 않고 델리미터째 평문으로
 * 남긴다(안전한 강등) — 조립의 원칙과 같다. 렌더러의 `throwOnError:false`에 맡기면
 * 대화 한가운데 빨간 에러 문자열이 뜨는데, 원문을 그대로 보여주는 편이 학습자에게
 * 읽을 거리가 남는다. 어느 쪽이든 **내용이 사라지지는 않는다.**
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

export type TutorSegment =
  /** 평문. 원문 공백·줄바꿈을 그대로 보존한다. */
  | { kind: 'text'; text: string }
  /** 렌더 가능한 수식. */
  | { kind: 'math'; latex: string; block: boolean }
  /** 스트리밍 중 아직 닫히지 않은 수식의 원문(델리미터 제외). */
  | { kind: 'pending'; source: string; block: boolean };

/**
 * 아직 닫히지 않은 여는 델리미터의 위치. 없으면 null.
 *
 * 이미 닫힌 쌍은(파스에 실패해 평문으로 강등될 쌍이라도) 열림으로 세지 않는다 —
 * `식은 $\frac{1}{$ 이다`처럼 강등된 구간의 뒷부분을 "오는 중"으로 오인하면
 * 멀쩡히 끝난 문장이 흐려진다.
 */
function findOpenDelimiter(text: string): { at: number; len: number } | null {
  let open: { at: number; len: number } | null = null;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '$') {
      i += 1;
      continue;
    }
    const len = text[i + 1] === '$' ? 2 : 1;
    if (open && open.len === len) open = null;
    else if (!open) open = { at: i, len };
    i += len;
  }
  return open;
}

/**
 * 별행 수식에 붙어 있던 줄바꿈 하나씩을 흡수한다.
 *
 * 별행 수식은 그 자체가 블록이라 이미 줄을 바꾼다. 패널은 평문을 `whitespace-pre-wrap`
 * 으로 그리므로, 원문의 `...\n$$x$$\n...`을 그대로 두면 줄바꿈이 두 번 먹혀 수식
 * 위아래에 빈 줄이 하나씩 더 생긴다. 문단 사이의 빈 줄(`\n\n`)은 하나만 먹으므로
 * 의도한 문단 간격은 그대로 남는다.
 */
function absorbBlockNewlines(segs: TutorSegment[]): TutorSegment[] {
  const out = [...segs];
  for (let i = 0; i < out.length; i += 1) {
    const seg = out[i];
    if (seg.kind !== 'math' || !seg.block) continue;
    const before = out[i - 1];
    if (before?.kind === 'text' && before.text.endsWith('\n')) {
      out[i - 1] = { kind: 'text', text: before.text.slice(0, -1) };
    }
    const after = out[i + 1];
    if (after?.kind === 'text' && after.text.startsWith('\n')) {
      out[i + 1] = { kind: 'text', text: after.text.slice(1) };
    }
  }
  return out.filter((s) => s.kind !== 'text' || s.text !== '');
}

/** 닫힌 텍스트(꼬리를 떼어 낸 뒤)를 평문/수식 구간으로 가른다. */
function segmentClosed(text: string): TutorSegment[] {
  const out: TutorSegment[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ kind: 'text', text: buffer });
    buffer = '';
  };

  const takeInline = (chunk: string) => {
    if (!chunk.includes('$')) {
      buffer += chunk;
      return;
    }
    let last = 0;
    INLINE_MATH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_MATH_RE.exec(chunk)) !== null) {
      buffer += chunk.slice(last, m.index);
      const latex = m[1].trim();
      if (isRenderableLatex(latex)) {
        flush();
        out.push({ kind: 'math', latex, block: false });
      } else {
        buffer += m[0]; // 강등: 델리미터째 평문으로 되돌린다
      }
      last = m.index + m[0].length;
    }
    buffer += chunk.slice(last);
  };

  if (!text.includes('$$')) {
    takeInline(text);
    flush();
    return out;
  }

  let last = 0;
  BLOCK_MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_MATH_RE.exec(text)) !== null) {
    takeInline(text.slice(last, m.index));
    const latex = m[1].trim();
    if (isRenderableLatex(latex)) {
      flush();
      out.push({ kind: 'math', latex, block: true });
    } else {
      buffer += m[0]; // 강등
    }
    last = m.index + m[0].length;
  }
  takeInline(text.slice(last));
  flush();
  return out;
}

/**
 * 튜터 답변 한 덩어리를 렌더 단위로 자른다.
 *
 * **스트리밍 중간 상태(`streaming: true`)의 처리.** 델타가 `$x^`까지만 온 시점에
 * 선택지는 셋이다: (a) `$x^`를 그대로 보여준다, (b) 채팅 패널의 선례처럼
 * (`authoring-chat.ts`의 `stripQuestionBlocks`) 닫히지 않은 구간을 숨긴다,
 * (c) 원문을 보이되 표시를 달리한다. (b)는 그 선례에선 옳았지만 — 거기서 숨기는 건
 * 산문에 새면 안 되는 JSON이다 — 여기선 **학습자가 읽고 있는 문장이 사라진다.**
 * 그래서 (c)를 택한다: 델리미터만 떼고 latex 원문을 흐린 고정폭으로 보여준다.
 *   - 내용이 사라지지 않는다(스트림이 수식 도중에 끊겨도 원문이 남는다).
 *   - `$`가 붙었다 사라지는 깜빡임이 없다. 닫히는 순간 그 자리가 수식으로 바뀌는데,
 *     "아직 오는 중"임을 이미 흐리게 표시해 뒀으니 예고된 전환이 된다.
 * 완결된 답변(`streaming: false`)에는 이 처리를 하지 않는다 — 그때의 홀수 `$`는
 * 미완성 수식이 아니라 대개 진짜 달러 기호이고, 임의로 떼면 내용이 바뀐다.
 */
export function splitTutorMath(
  text: string,
  opts: { streaming?: boolean } = {},
): TutorSegment[] {
  // 수식이 없는 답변(기존 전 과목)은 여기서 끝난다 — KaTeX를 아예 부르지 않고,
  // 결과도 예전과 같은 "평문 한 덩어리"다.
  if (!text.includes('$')) return text ? [{ kind: 'text', text }] : [];

  let body = text;
  let pending: TutorSegment | null = null;

  if (opts.streaming) {
    const open = findOpenDelimiter(text);
    if (open) {
      const source = text.slice(open.at + open.len);
      // `가격은 $100`처럼 통화 표기일 수 있는 꼬리는 건드리지 않는다 —
      // 인라인 정규식의 `(?!\d+\$)` 가드와 같은 시야를 갖는다.
      if (!/^\d/.test(source)) {
        body = text.slice(0, open.at);
        pending = { kind: 'pending', source, block: open.len === 2 };
      }
    }
  }

  const out = absorbBlockNewlines(segmentClosed(body));
  if (pending) out.push(pending);
  return out;
}

/** 첫 진입에서 보여줄 추천 질문 — 복습에서 실제로 막히는 세 질문(#40 §A). */
export const REVIEW_TUTOR_SUGGESTIONS = [
  '제가 고른 답은 왜 틀렸나요?',
  '왜 이게 정답인가요?',
  '비슷한 문제를 또 틀리지 않으려면 뭘 봐야 하나요?',
] as const;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 저장된 대화 이력(Redis, 24h). 패널을 다시 열면 이어 보인다. */
export async function fetchReviewTutorHistory(questionId: string): Promise<ReviewTutorTurn[]> {
  const { fetchOrFail } = await import('./api');
  // 이력은 있으면 좋은 부가 정보다. 서버가 거절하면(!res.ok) 이미 빈 목록으로 넘어가는데,
  // 연결 실패만 예외를 던져 패널을 통째로 깨뜨릴 이유가 없다 — 같은 취급으로 맞춘다.
  const res = await fetchOrFail(
    `${API_BASE}/tutor/review-history?questionId=${encodeURIComponent(questionId)}`,
    { headers: authHeaders() },
  ).catch(() => null);
  if (!res || !res.ok) return [];
  const body = (await res.json()) as { turns?: ReviewTutorTurn[] };
  return body.turns ?? [];
}

/**
 * 복습 코치에게 질문하고 응답을 스트리밍으로 받는다.
 * 델타는 `onDelta`로 흘리고, 완결 시 누적 전체를 `onDone`에 넘긴다.
 */
export async function streamReviewTutorChat(
  body: { questionId: string; message: string },
  handlers: {
    onDelta: (delta: string, full: string) => void;
    onDone: (full: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const { fetchOrFail } = await import('./api');
  let res: Response;
  try {
    res = await fetchOrFail(`${API_BASE}/tutor/review-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // 연결 실패는 상태 코드가 없다 — 아래 `요청 실패 (${res.status})` 경로로 못 간다.
    handlers.onError((e as Error).message);
    return;
  }

  if (!res.ok || !res.body) {
    if (res.status === 401) {
      const { handleUnauthorized } = await import('./api');
      handleUnauthorized();
    }
    // 서버가 사유를 주는 실패는 그대로 보여준다 — 403("응시 중이라 안 된다"),
    // 402("오늘 무료분을 다 썼고 AI 크레딧도 없다"). 문구를 여기서 다시 짓지 않는다.
    const detail = await res
      .json()
      .then((b: { message?: string }) => b?.message)
      .catch(() => null);
    handlers.onError(detail || `요청 실패 (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 프레임은 빈 줄(\n\n)로 구분된다.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const isError = frame.startsWith('event: error');
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      let payload: { delta?: string; done?: boolean; message?: string };
      try {
        payload = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (isError) {
        handlers.onError(payload.message || '응답 생성 중 오류가 발생했어요.');
        return;
      }
      if (payload.delta) {
        full += payload.delta;
        handlers.onDelta(payload.delta, full);
      }
      if (payload.done) {
        handlers.onDone(full);
        return;
      }
    }
  }

  // 스트림이 done 프레임 없이 끊긴 경우 — 받은 만큼은 살린다.
  handlers.onDone(full);
}
