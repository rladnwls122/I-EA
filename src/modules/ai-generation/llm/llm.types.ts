/**
 * LLM에 강제하는 출력 계약(JSON only).
 * 노드 트리(ProseMirror)를 직접 생성시키지 않고 "평문"만 받는다 —
 * 저장 포맷 조립은 우리 코드(prosemirror.util)가 담당한다.
 */
import { QuestionKind } from '@/common/constants/question';
import { OutputLanguage } from '../exam-format';
import { AnswerMode } from '../format-templates';

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
  /** 핵심 개념 #키워드(선택) — 오답노트 개념별 통계용. find-or-create로 태그화된다. */
  keywords?: string[];
  /**
   * 다중지문 모드(passageCount >= 2) 전용 — 이 문항의 근거 지문 인덱스(0부터, passages 순서).
   * 단일 지문/무지문 모드에서는 쓰지 않는다.
   */
  passageIndex?: number;
  /**
   * 지문 내장 빈칸 모드(#43 gap 9 — 토익 Part 6) 전용 — 이 문항이 맡은 지문 속 빈칸 번호(1부터).
   * 지문 평문의 `[[n]]` 마커와 일대일로 대응하며, 파서가 대응 관계를 검증한다.
   */
  blankIndex?: number;
  difficulty: number;
}

export interface LlmGenerationResult {
  /** 단일 지문 모드(passageCount <= 1) 전용 — 종전 계약 그대로. */
  passage?: {
    title?: string;
    bodyText: string;
  };
  /**
   * 다중지문 모드(passageCount >= 2) 전용 — 지문 평문 배열(gap 3).
   * 배열 순서가 지문 번호다((가)(나)·문서 1/2/3). 개수는 요청한 passageCount와 일치해야 한다.
   */
  passages?: string[];
  questions: LlmQuestion[];
}

/**
 * LLM 자기검증(#34 후속) — 생성 결과를 2차 호출로 다시 판정한 결과 한 건.
 *
 * 판정은 결정 3의 5개 축 중 **코드가 못 잡는 4축**만 본다(형식 규격은 파서가 이미 검증).
 * 축을 문자열로 두지 않고 열거 값으로 고정해, 프롬프트가 흔들려도 기록이 통계로 모인다.
 */
export const REVIEW_AXES = ['발문형식', '오답매력도', '난이도일관성', '지문문항정합'] as const;
export type ReviewAxis = (typeof REVIEW_AXES)[number];

export interface LlmReviewVerdict {
  /** 판정 대상 문항의 인덱스(questions 배열 순서, 0부터). */
  index: number;
  /** PASS = 시험에 낼 수 있다 / REVISE = 손봐야 한다. 어느 쪽이든 **버리지 않고 기록**한다. */
  verdict: 'PASS' | 'REVISE';
  /** 지적된 축(REVISE일 때 최소 1개). */
  axes: ReviewAxis[];
  /** 사람이 읽을 지적 사항. 검수 화면·로그에 그대로 실린다. */
  issues: string[];
}

export interface LlmReviewResult {
  verdicts: LlmReviewVerdict[];
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
  /** 선지 언어. 생략 시 시험/대분류로 추정한다 — 영어 지문 문항에 한국어 선지가 붙지 않도록. */
  language?: OutputLanguage;
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
  /**
   * 지문 수(0~3). 2 이상이면 다중지문 세트 모드(gap 3) — 응답 계약이 passages[] +
   * 문항별 passageIndex로 바뀌고 파서가 개수·인덱스·빈 지문을 검증한다.
   * 생략 시 includePassage로 0/1을 따른다(종전 동작).
   */
  passageCount?: number;
  /**
   * 다중지문 세트의 지문 표시 이름(#43). 프롬프트에는 쓰지 않고 저장 시 Passage.label로 간다 —
   * LLM은 순서(passages 배열 인덱스)만 알면 되고 라벨은 우리 표기 관행이다.
   */
  passageLabels?: string[];
  questionType?: QuestionKind;
  /** OX(참/거짓) 2지선다 스타일 힌트. questionType 저장값은 그대로 객관식 — 별도 타입을 만들지 않는다. */
  ox?: boolean;
  /**
   * 객관식 선지 개수(2~8). 지정하면 프롬프트로 강제하고 응답 검증에서도 정확히 이 개수를 요구한다.
   * 생략하면 시험별 관행(exam-format.ts)을 프롬프트 지시로만 흘려보내고 검증은 느슨하게 둔다 —
   * 시험이 5지·4지로 갈리는데(#36) 지정 수단이 없던 것을 메운다.
   */
  choiceCount?: number;
  /**
   * 출력 언어. 생략 시 시험/대분류로 추정한다(resolveOutputLanguage).
   * 한국어 강제를 풀지 않으면 영어 계열(토익 RC·수능/내신/공무원 영어)이 생성 자체가 안 된다(#36).
   */
  language?: OutputLanguage;
  /** 소분류명 (예: 문학) */
  subjectName?: string;
  /** 대분류 (예: 국어) */
  examCategory?: string;
  /** 시험 (예: 수능, 내신). 누락 시 LLM이 수능 스타일로 치우친다. */
  examType?: string;
  /**
   * 정답 개수 모드(#43 gap 4). 'multiple'이면 정답(isCorrect:true) 2개 이상을 허용하고
   * 프롬프트에 복수정답 지시를 싣는다(내신 "모두 고른 것은?"). 생략 시 종전대로 단일정답 강제.
   */
  answerMode?: AnswerMode;
  /**
   * 출제 형식 템플릿의 프롬프트 지시(#43). 시험별 관행(examFormatHints)보다 구체적인
   * 발문 패턴·소재·선지 관행이 담기며, 프롬프트에서 examFormatHints 뒤에 그대로 실린다.
   */
  templateHints?: string[];
  /**
   * 지문 내장 빈칸 모드(#43 gap 9). true면 지문 평문에 `[[1]]`…`[[N]]` 마커를 넣고
   * 문항마다 blankIndex로 자기 빈칸을 가리키게 한다(N = questionCount, 문항:빈칸 = 1:1).
   * 생략/false면 종전 계약 그대로 — 마커는 등장하지 않는다.
   */
  blanksInPassage?: boolean;
  /**
   * 이미 존재하는 #키워드 풀(태그명). LLM이 새 키워드를 남발하지 않고 가능한 한
   * 이 목록에서 골라 쓰게 해, 오답노트 개념별 통계가 흩어지지 않고 모이게 한다.
   */
  existingKeywords?: string[];
}

