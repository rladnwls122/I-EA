/**
 * MVP 공통 상수. 문제 유형은 enum이 아니라 VARCHAR("객관식"|"주관식")로 저장하므로,
 * 앱 전 계층(DTO 검증·채점·생성)이 이 상수를 단일 출처로 참조한다.
 */

export const QUESTION_KINDS = ['객관식', '주관식'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

// 오답노트 2.0 — 텍스트 주석
export const ANNOTATION_TARGETS = ['GENERAL', 'PASSAGE', 'STEM', 'CHOICES', 'EXPLANATION'] as const;
export type AnnotationTarget = (typeof ANNOTATION_TARGETS)[number];

export const MARK_STYLES = ['HIGHLIGHT', 'UNDERLINE'] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];

export const REASON_CODES = ['CONCEPT', 'MISTAKE', 'TIME', 'OTHER'] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** 오답 원인 코드 → 한글 라벨 (오답노트 통계 byReason 표기용). */
export const REASON_LABELS: Record<ReasonCode, string> = {
  CONCEPT: '개념부족',
  MISTAKE: '실수',
  TIME: '시간부족',
  OTHER: '기타',
};
