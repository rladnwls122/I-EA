/**
 * LLM에 강제하는 출력 계약(JSON only).
 * 노드 트리(ProseMirror)를 직접 생성시키지 않고 "평문 + 빈칸 토큰"만 받는다 —
 * 저장 포맷(3.6.1) 조립은 우리 코드(prosemirror.util)가 담당한다.
 */

export interface LlmChoice {
  /** 선지 본문(평문) */
  content: string;
  isCorrect: boolean;
  /** 오답노트용 선지별 해설(평문, 선택) */
  explanation?: string;
}

export interface LlmQuestion {
  questionType: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'OX' | 'SHORT_ANSWER' | 'ESSAY';
  /** 발문 평문. SHORT_ANSWER는 빈칸 자리에 [[blank]] 토큰을 넣는다. */
  stemText: string;
  /** 객관식/OX 전용 */
  choices?: LlmChoice[];
  /** SHORT_ANSWER 전용: stemText의 [[blank]] 순서대로 대응하는 정답들 */
  shortAnswers?: string[];
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

/** 생성 파이프라인에 넘기는 컨텍스트 */
export interface LlmGenerationContext {
  prompt: string;
  difficulty: number;
  questionCount: number;
  includePassage: boolean;
  questionType?: string;
  subjectName?: string;
  unitName?: string;
}
