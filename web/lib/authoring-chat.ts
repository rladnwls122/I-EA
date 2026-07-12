// 대화형 출제 캔버스 — SSE 채팅 소비 + qidea-questions 펜스 블록 파서.
// 백엔드 POST /ai-generations/chat 는 SSE로 산문을 스트리밍하고, 끝에
// ```qidea-questions 펜스 블록으로 평문 문항 배열을 방출한다.

const BLOCK_RE = /```qidea-questions\s*([\s\S]*?)```/g;

export interface ParsedQuestion {
  target: string; // "new" | "replace:N"
  questionType: '객관식' | '주관식';
  stem: string;
  choices?: string[];
  correctIndex?: number;
  answerText?: string;
  explanation?: string;
  passage?: string;
}

/** qidea-questions 펜스 블록(들)에서 문항 배열을 파싱. 실패 시 빈 배열(크래시 금지). */
export function parseQuestionBlocks(text: string): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  // matchAll()의 이터레이터를 for...of로 도는 건 target es2015+가 필요해
  // (web/tsconfig.json은 target 미지정 → 기본 ES3) exec() 수동 루프로 대체한다.
  BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    try {
      const arr = JSON.parse(m[1].trim());
      if (Array.isArray(arr)) {
        for (const q of arr) {
          // questionType은 허용값을 조기 검증 — 임의 문자열이 카드/저장까지 흘러가
          // 원인 불명의 저장 실패로 보이는 것을 막는다.
          if (
            q &&
            typeof q.stem === 'string' &&
            (q.questionType === '객관식' || q.questionType === '주관식')
          ) {
            out.push(q as ParsedQuestion);
          }
        }
      }
    } catch {
      // 깨진 블록은 무시 — 산문은 그대로 살린다.
    }
  }
  return out;
}

/** 펜스 블록을 제거하고 산문만 반환. */
export function stripQuestionBlocks(text: string): string {
  return text.replace(BLOCK_RE, '').trim();
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface AuthoringChatBody {
  workbookId: string;
  subjectId: string;
  message: string;
  batchSize?: number;
  currentQuestions?: {
    index: number;
    questionType: string;
    stem: string;
    choices?: string[];
    answer?: string;
    explanation?: string;
  }[];
}

/**
 * SSE 스트림 소비. data 프레임 { delta } 누적, { done } 종료, event: error 처리.
 * 델타를 onDelta로 흘리고 완료 시 누적 전체를 onDone에 넘긴다.
 */
export async function streamAuthoringChat(
  body: AuthoringChatBody,
  handlers: {
    onDelta: (delta: string, full: string) => void;
    onDone: (full: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_BASE}/ai-generations/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    handlers.onError(`요청 실패 (${res.status})`);
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
      let payload: any;
      try {
        payload = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (isError) {
        handlers.onError(payload.message ?? '오류가 발생했습니다.');
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
  handlers.onDone(full);
}
