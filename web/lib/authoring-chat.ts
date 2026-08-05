// 대화형 출제 캔버스 — SSE 채팅 소비 + qidea-questions 펜스 블록 파서.
// 백엔드 POST /ai-generations/chat 는 SSE로 산문을 스트리밍하고, 끝에
// ```qidea-questions 펜스 블록으로 평문 문항 배열을 방출한다.

// 닫는 ```가 잘려도(스트림 중단·토큰 상한) 마지막 블록을 살리도록 (```|$) 허용.
// 3번 그룹으로 "닫혔는지"를 알 수 있다 — strip이 스트리밍 중 부분 블록을 판별하는 데 쓴다.
// 언어 태그는 qidea-questions가 정본이지만 모델이 json/무태그로 흘리는 변형도 스캔한다.
const BLOCK_RE = /```(qidea-questions|json)?\s*\n?([\s\S]*?)(```|$)/g;

export interface ParsedQuestion {
  target: string; // "new" | "replace:N"
  questionType: '객관식' | '주관식';
  stem: string;
  choices?: string[];
  correctIndex?: number;
  answerText?: string;
  explanation?: string;
  passage?: string;
  /** AI가 제안한 핵심 개념 #키워드 — 오답노트 개념별 통계용. 사용자가 편집 가능. */
  keywords?: string[];
}

/** 모델이 낸 questionType 변형("객관식(5지선다)" 등)을 정본 값으로 정규화. 실패 시 null. */
function normalizeQuestionType(v: unknown): '객관식' | '주관식' | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.indexOf('객관') === 0 || s.toUpperCase() === 'OX') return '객관식';
  if (s.indexOf('주관') === 0 || s.indexOf('단답') === 0 || s.indexOf('서술') === 0) return '주관식';
  return null;
}

/** JS 스타일 주석·트레일링 콤마 등 흔한 LLM JSON 오염을 제거한 뒤 파싱을 재시도한다. */
function parseJsonLenient(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    /* 아래에서 정화 후 재시도 */
  }
  const cleaned = raw
    .replace(/\/\/[^\n"]*$/gm, '') // 줄 끝 // 주석(따옴표 안은 남을 수 있으나 근사)
    .replace(/,\s*([}\]])/g, '$1'); // 트레일링 콤마
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** 배열 원소 하나를 ParsedQuestion으로 정규화. 형식이 어긋나면 null. */
function normalizeQuestion(q: any): ParsedQuestion | null {
  if (!q || typeof q.stem !== 'string' || !q.stem.trim()) return null;
  const questionType = normalizeQuestionType(q.questionType);
  if (!questionType) return null;
  const correctIndex =
    typeof q.correctIndex === 'number'
      ? q.correctIndex
      : typeof q.correctIndex === 'string' && /^\d+$/.test(q.correctIndex.trim())
        ? Number(q.correctIndex.trim())
        : undefined;
  return {
    target: typeof q.target === 'string' ? q.target : 'new',
    questionType,
    stem: q.stem,
    choices: Array.isArray(q.choices) ? q.choices.map((c: unknown) => String(c)) : undefined,
    correctIndex,
    answerText: typeof q.answerText === 'string' ? q.answerText : undefined,
    explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
    passage: typeof q.passage === 'string' ? q.passage : undefined,
    keywords: Array.isArray(q.keywords)
      ? q.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
      : undefined,
  };
}

/**
 * qidea-questions 펜스 블록(들)에서 문항 배열을 파싱. 실패 시 빈 배열(크래시 금지).
 * 모델 출력 드리프트(json 태그, 주석, 트레일링 콤마, 잘린 블록)에 관대하게 대응하고,
 * 그래도 실패하면 원문을 console.warn으로 남겨 원인 추적이 가능하게 한다.
 */
export function parseQuestionBlocks(text: string): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  // matchAll()의 이터레이터를 for...of로 도는 건 target es2015+가 필요해
  // (web/tsconfig.json은 target 미지정 → 기본 ES3) exec() 수동 루프로 대체한다.
  BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    const body = m[2].trim();
    if (!body) continue;
    // 무태그/json 블록은 문항 배열 형태일 때만 수용(코드 예시 등 오탐 방지).
    const parsed = parseJsonLenient(body);
    if (!Array.isArray(parsed)) {
      if (m[1] === 'qidea-questions') {
        console.warn('[authoring-chat] qidea-questions 블록 파싱 실패:', body.slice(0, 500));
      }
      continue;
    }
    for (const q of parsed) {
      const norm = normalizeQuestion(q);
      if (norm) out.push(norm);
      else if (m[1] === 'qidea-questions') {
        console.warn('[authoring-chat] 문항 원소 정규화 실패:', JSON.stringify(q).slice(0, 300));
      }
    }
  }
  return out;
}

/**
 * 산문에서 지울 "문항 블록"인지 판정 — parseQuestionBlocks가 실제로 소비하는
 * 블록과 일관되게 맞춘다(정본 태그는 무조건, 무태그/json은 문항 배열일 때만).
 * 일반 코드 예시 펜스는 산문에 남긴다.
 */
function isQuestionBlock(lang: string | undefined, rawBody: string, closed: boolean): boolean {
  if (lang === 'qidea-questions') return true;
  const body = rawBody.trim();
  const parsed = body ? parseJsonLenient(body) : null;
  if (Array.isArray(parsed)) {
    // 파서(parseQuestionBlocks)가 문항으로 소비하는 무태그/json 블록과 동일 기준 —
    // 원소가 하나라도 문항으로 정규화되면 문항 블록이다. 문자열 배열 등 코드 예시는 남는다.
    return parsed.some((q) => normalizeQuestion(q) !== null);
  }
  if (!closed) {
    // 스트리밍 중 잘린(아직 닫는 ```가 없는) 블록 — 문항 데이터가 산문에 새어 보이지
    // 않게 미리 숨긴다(기존 숨김 동작 유지). 닫힌 뒤 문항 블록이 아니면 그때 노출된다.
    if (!body) return true; // 막 열린 ``` — 정체 확정 전
    if (lang === 'json') return true; // json 태그 블록은 닫힌 뒤 문항 배열 여부로만 판정
    const firstLine = body.split('\n')[0].trim();
    if ('qidea-questions'.startsWith(firstLine)) return true; // 언어 태그 자체가 잘린 중
    // '['만 도착한 시점에도 숨긴다 — /^\[\s*\{/처럼 '{'까지 기다리면 그 사이 원문이
    // 플리커로 노출된다.
    return body.startsWith('[');
  }
  return false;
}

/** 문항 펜스 블록만 제거하고 산문을 반환 — 일반 코드 예시 펜스는 남긴다. */
export function stripQuestionBlocks(text: string): string {
  BLOCK_RE.lastIndex = 0;
  return text
    .replace(BLOCK_RE, (match, lang: string | undefined, body: string, closer: string) =>
      isQuestionBlock(lang, body ?? '', closer === '```') ? '' : match,
    )
    .trim();
}

/**
 * AI가 낸 문항이 캔버스 카드(toCard)로 만들 수 없는 이유 — 통과면 null.
 * 캔버스의 toCard 검증과 단일 출처를 이뤄, 실패 시 사유를 채팅 스레드/토스트에
 * 그대로 노출한다(조용히 버려지는 것 방지).
 */
export function questionRejectReason(q: ParsedQuestion): string | null {
  if (q.questionType !== '객관식') return null; // 주관식은 거부 조건 없음
  const choices = q.choices ?? [];
  if (choices.length < 2) return `선지가 ${choices.length}개뿐이에요(최소 2개)`;
  const c = q.correctIndex;
  if (typeof c !== 'number') return '정답 번호(correctIndex)가 없어요';
  if (c < 0 || c >= choices.length) {
    return `정답 번호(${c + 1}번)가 선지 범위(1~${choices.length}번) 밖이에요`;
  }
  return null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface AuthoringChatBody {
  workbookId: string;
  subjectId: string;
  message: string;
  batchSize?: number;
  /** 설정 패널의 유형 힌트 — 지정 시 이번 턴 생성 유형을 강제. */
  questionType?: '객관식' | '주관식';
  /** OX(참/거짓) 스타일 힌트. */
  ox?: boolean;
  /** 난이도 1~5. */
  difficulty?: number;
  /** 객관식 선지 개수(2~8). 생략하면 시험별 관행을 프롬프트로 유도만 한다. */
  choiceCount?: number;
  /** 지문을 함께 만들지. 생략하면 AI가 문항 성격에 따라 판단한다. */
  includePassage?: boolean;
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
    if (res.status === 401) {
      // 만료/무효 토큰 — 중앙 처리(토큰 클리어 + /login?callbackUrl=)로 위임.
      const { handleUnauthorized } = await import('./api');
      handleUnauthorized();
    }
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
