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

/** 생성 파이프라인에 넘기는 컨텍스트 */
export interface LlmGenerationContext {
  prompt: string;
  difficulty: number;
  questionCount: number;
  includePassage: boolean;
  questionType?: QuestionKind;
  /** 세부과목명 (예: 문학) */
  subjectName?: string;
  /** 대분류 (예: 국어) */
  examCategory?: string;
}
