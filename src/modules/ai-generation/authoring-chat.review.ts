/**
 * 출제 캔버스 응답에서 **문항 블록을 서버가 다시 읽는다** (#33 도그푸딩 잔여 1).
 *
 * 왜 필요한가: 자기검증(#34)은 지금까지 비동기 생성 파이프라인(`POST /ai-generations`)에만
 * 붙어 있었는데, **화면이 그 경로를 부르지 않는다** — 캔버스는 SSE 출제 채팅을 쓴다.
 * 그래서 "자기검증을 기본으로 켠다"를 환경변수만 뒤집어 끝내면 실사용에서는 아무것도
 * 달라지지 않는다. 검수가 실제로 붙어야 하는 자리는 사람이 문항을 다듬는 이 화면이다.
 *
 * 채팅 응답은 산문 + ```qidea-questions 펜스 블록(평문 JSON 배열)이다. 프런트가 그 블록을
 * 파싱해 카드로 만든다(`web/lib/authoring-chat.ts`). 판정을 하려면 서버도 같은 블록을
 * 읽어야 하는데, **두 파서가 같은 배열을 만들어야** 판정 결과의 index가 카드와 맞는다.
 * 그래서 규칙(펜스 스캔·관대한 JSON 정화·유형 정규화·거부 조건)을 프런트와 나란히 두고
 * `authoring-chat.review.spec.ts`가 같은 입력에 같은 결과가 나오는지 고정한다.
 *
 * ⚠️ 프런트 파서를 고치면 여기도 같은 커밋에서 고쳐야 한다. 어긋나면 판정이 **다른 문항에**
 * 붙는다 — 조용히 틀린 배지가 뜨는 건 배지가 없는 것보다 나쁘다.
 */
import { QuestionKind } from '@/common/constants/question';
import type { LlmGenerationResult, LlmQuestion } from './llm/llm.types';

/** 닫는 ```가 없어도(토큰 상한으로 잘린 경우) 마지막 블록을 살린다 — 프런트와 같은 정규식. */
const BLOCK_RE = /```(qidea-questions|json)?\s*\n?([\s\S]*?)(```|$)/g;

/** 모델이 낸 questionType 변형("객관식(5지선다)" 등)을 정본 값으로. 실패 시 null. */
function normalizeQuestionType(v: unknown): QuestionKind | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.indexOf('객관') === 0 || s.toUpperCase() === 'OX') return '객관식';
  if (s.indexOf('주관') === 0 || s.indexOf('단답') === 0 || s.indexOf('서술') === 0) return '주관식';
  return null;
}

/** JS 주석·트레일링 콤마 같은 흔한 LLM JSON 오염을 걷어내고 재시도한다(프런트와 같은 정화). */
function parseJsonLenient(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    /* 아래에서 정화 후 재시도 */
  }
  const cleaned = raw.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** 판정에 필요한 만큼만 담은 문항 하나. 카드와 자리(index)를 맞추는 게 이 타입의 목적이다. */
export interface ChatQuestion extends LlmQuestion {
  /** 이 문항이 딸고 온 지문 평문(있으면). 지문-문항 정합 축을 보려면 필요하다. */
  passageText?: string;
}

/** 배열 원소 하나를 판정용 문항으로 — 프런트 normalizeQuestion과 같은 수용 기준. */
function normalizeQuestion(raw: unknown): ChatQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.stem !== 'string' || !q.stem.trim()) return null;
  const questionType = normalizeQuestionType(q.questionType);
  if (!questionType) return null;

  const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c)) : undefined;
  const correctIndex =
    typeof q.correctIndex === 'number'
      ? q.correctIndex
      : typeof q.correctIndex === 'string' && /^\d+$/.test(q.correctIndex.trim())
        ? Number(q.correctIndex.trim())
        : undefined;

  return {
    questionType,
    stemText: q.stem,
    ...(choices
      ? { choices: choices.map((content, i) => ({ content, isCorrect: i === correctIndex })) }
      : {}),
    ...(typeof q.answerText === 'string' ? { answerText: q.answerText } : {}),
    ...(typeof q.explanation === 'string' ? { explanationText: q.explanation } : {}),
    ...(typeof q.passage === 'string' && q.passage.trim() ? { passageText: q.passage } : {}),
    // 캔버스 채팅 계약에는 문항별 난이도가 없다 — 요청 난이도를 호출부가 채워 넣는다.
    difficulty: 0,
  };
}

/**
 * 채팅 응답 전문에서 문항 배열을 읽는다. 프런트가 카드로 만드는 것과 **같은 순서**다.
 * 파싱 실패는 빈 배열 — 판정을 못 하는 것이지 채팅이 실패한 것은 아니다.
 */
export function parseChatQuestions(text: string): ChatQuestion[] {
  const out: ChatQuestion[] = [];
  BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    const body = m[2].trim();
    if (!body) continue;
    const parsed = parseJsonLenient(body);
    if (!Array.isArray(parsed)) continue; // 무태그/json 블록은 문항 배열일 때만 수용(코드 예시 보호)
    for (const item of parsed) {
      const norm = normalizeQuestion(item);
      if (norm) out.push(norm);
    }
  }
  return out;
}

/**
 * 판정 입력(LlmGenerationResult)으로 접는다. 지문은 첫 문항의 것을 대표로 싣는다 —
 * 캔버스 한 턴은 보통 지문 하나를 공유하고, 판정 프롬프트의 지문 자리는 하나뿐이다.
 */
export function toReviewInput(questions: ChatQuestion[], difficulty: number): LlmGenerationResult {
  const passageText = questions.find((q) => q.passageText)?.passageText;
  return {
    ...(passageText ? { passage: { bodyText: passageText } } : {}),
    // passageText는 계약(LlmQuestion) 밖 필드라 판정 입력에 싣지 않는다 — 실을 필드를
    // 명시적으로 고른다(구조분해로 버리면 미사용 바인딩이 lint 에러가 된다).
    questions: questions.map((q) => ({
      questionType: q.questionType,
      stemText: q.stemText,
      ...(q.choices ? { choices: q.choices } : {}),
      ...(q.answerText ? { answerText: q.answerText } : {}),
      ...(q.explanationText ? { explanationText: q.explanationText } : {}),
      difficulty,
    })),
  };
}
