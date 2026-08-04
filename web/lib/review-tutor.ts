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
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface ReviewTutorTurn {
  role: 'user' | 'model';
  text: string;
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
  const res = await fetch(
    `${API_BASE}/tutor/review-history?questionId=${encodeURIComponent(questionId)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
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
  const res = await fetch(`${API_BASE}/tutor/review-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });

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
