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

// 문제집 공개 범위. questionType과 같이 enum이 아니라 VARCHAR로 저장한다.
export const WORKBOOK_VISIBILITIES = ['PRIVATE', 'PUBLIC'] as const;
export type WorkbookVisibility = (typeof WORKBOOK_VISIBILITIES)[number];

/**
 * 문항 통계(정답률·평균 풀이시간) 노출 최소 표본.
 * 표본이 이보다 적으면 null을 반환해 "3명 중 1명이 틀림 = 정답률 67%" 같은
 * 오해를 막는다. 선지 분포는 개별 응답 수라 이 임계값을 적용하지 않는다.
 */
export const STATS_MIN_SAMPLE = 10;

/**
 * 문항/문제집 #키워드 태그 카테고리 — 과목·난이도 등 큐레이션 태그(ADMIN/CREATOR 전용)와
 * 구분되는 자유 태깅. 이 카테고리만 일반 유저도 생성할 수 있다(catalog.service 참고).
 */
export const KEYWORD_TAG_CATEGORY = '키워드';
