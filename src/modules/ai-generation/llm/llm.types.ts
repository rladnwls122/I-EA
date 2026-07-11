/**
 * LLM에 강제하는 출력 계약(JSON only).
 * 노드 트리(ProseMirror)를 직접 생성시키지 않고 "평문"만 받는다 —
 * 저장 포맷 조립은 우리 코드(prosemirror.util)가 담당한다.
 */
import { QuestionKind } from '@/common/constants/question';

export interface LlmChoice {
  /** 선지 본문(평문) */
  content: string;
  isCorrect: boolean;
  /** 오답노트용 선지별 해설(평문, 선택) */
  explanation?: string;
}

export interface LlmQuestion {
  questionType: QuestionKind; // "객관식" | "주관식"
  /** 발문 평문 */
  stemText: string;
  /** 객관식 전용 선지 */
  choices?: LlmChoice[];
  /** 주관식 단답 정답(평문). 있으면 자동채점, 없으면 서술형(자기채점) */
  answerText?: string;
  /** 전체 해설(평문, 선택) */
  explanationText?: string;
  difficulty: number;
}

export interface LlmGenerationResult {
  passage?: {
    title?: string;
    bodyText: string;
  };
  questions: LlmQuestion[];
}

/**
 * 선지 재생성 컨텍스트 (인라인 UX, 동기 호출).
 * 에디터에 떠 있는 "현재" 지문 텍스트를 받는다 — 저장된 값이 아니다.
 */
export interface LlmRegenerateChoicesContext {
  /** 에디터 상의 발문 평문 */
  stemText: string;
  /** 생성할 선지 개수 (2~8) */
  choiceCount: number;
  difficulty?: number;
  subjectName?: string;
  examCategory?: string;
  examType?: string;
}

/** 선지 재생성 결과. 정답 포함 전체 선지 집합을 새로 만든다. */
export interface LlmRegenerateChoicesResult {
  choices: LlmChoice[];
}

/**
 * AI 튜터 대화 한 턴. Redis 히스토리 저장 형식이자 streamChat의 입력 형식이다.
 * Gemini contents의 role 규약(user/model)을 그대로 따른다.
 */
export interface TutorTurn {
  role: 'user' | 'model';
  text: string;
}

/** 생성 파이프라인에 넘기는 컨텍스트 */
export interface LlmGenerationContext {
  prompt: string;
  difficulty: number;
  questionCount: number;
  includePassage: boolean;
  questionType?: QuestionKind;
  /** OX(참/거짓) 2지선다 스타일 힌트. questionType 저장값은 그대로 객관식 — 별도 타입을 만들지 않는다. */
  ox?: boolean;
  /** 소분류명 (예: 문학) */
  subjectName?: string;
  /** 대분류 (예: 국어) */
  examCategory?: string;
  /** 시험 (예: 수능, 내신). 누락 시 LLM이 수능 스타일로 치우친다. */
  examType?: string;
}
