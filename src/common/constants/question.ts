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
 * 문항 배치 엔드포인트 한 요청의 항목 수 상한 (#41 Phase 3 마감).
 *
 * 상한 없는 배치는 트랜잭션 타임아웃과 페이로드 폭주로 돌아온다 —
 * SESSION_MAX_QUESTIONS·NOTES_GRADED_LIMIT과 같은 판단이다. 배치는 항목마다
 * 트랜잭션을 하나씩 순차로 열기 때문에 한 요청의 처리 시간이 항목 수에 비례한다.
 *
 * 50인 이유: 캔버스 한 화면의 현실적 문항 수(20~30) 위이면서, 문항 하나가
 * ProseMirror JSON(발문·선지·해설)을 통째로 싣는다는 점을 감안한 페이로드 크기다.
 * 이보다 많으면 클라이언트가 나눠 보낸다(순서를 지켜 순차로).
 *
 * ⚠️ 프런트가 같은 값으로 나눠 보내야 한다 — `web/lib/api.ts`의 사본과
 * `question.batch.web-mirror.spec.ts`가 대조한다.
 */
export const QUESTION_BATCH_MAX = 50;

// 태그 카테고리는 tag.ts로 옮겼다 — 정본 목록과 한곳에 있어야 드리프트를 막는다.
