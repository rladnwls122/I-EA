/**
 * 오답노트 텍스트 주석 — 앵커 해석·상수 유틸.
 * 백엔드 단일 출처(src/common/constants/question.ts)와 값이 일치해야 한다.
 */

export const MARK_STYLES = ['HIGHLIGHT', 'UNDERLINE'] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];

export const REASON_CODES = ['CONCEPT', 'MISTAKE', 'TIME', 'OTHER'] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_LABELS: Record<ReasonCode, string> = {
  CONCEPT: '개념부족',
  MISTAKE: '실수',
  TIME: '시간부족',
  OTHER: '기타',
};

/** 원인 코드 → 한글 라벨. 알 수 없는 코드는 원문 반환. */
export function getReasonLabel(code?: string | null): string {
  if (!code) return '';
  return REASON_LABELS[code as ReasonCode] ?? code;
}

/** 색 코드 → hex. 기존 팔레트 토큰과 동일(globals.css --chart-* 계열). */
export const ANNOTATION_COLORS: Record<string, string> = {
  yellow: '#fbbf24',
  emerald: '#34d399',
  purple: '#a78bfa',
  blue: '#60a5fa',
};

export function colorHex(code?: string | null): string {
  if (!code) return ANNOTATION_COLORS.yellow;
  return ANNOTATION_COLORS[code] ?? code; // hex를 직접 저장한 경우 그대로
}

export type AnchorStatus = 'NORMAL' | 'RECOVERED' | 'LOST';

export interface ResolvedAnchor {
  start: number;
  end: number;
  status: AnchorStatus;
}

/**
 * 저장된 앵커(selectionRange + selectedText)를 현재 평문에 대해 해석한다.
 * - NORMAL: 오프셋 위치 텍스트가 selectedText와 일치
 * - RECOVERED: 불일치 → 평문에서 selectedText 첫 매치를 재검색해 성공
 * - LOST: 재검색 실패 — 마크는 생략하고 패널에서 "위치 유실"로 표시
 * 앵커가 아예 없으면(GENERAL 메모 등) null.
 * 데이터는 어떤 경우에도 삭제하지 않는다.
 */
export function resolveAnnotation(
  plain: string,
  ann: { selectionRange?: any; selectedText?: string | null },
): ResolvedAnchor | null {
  const range = ann.selectionRange;
  const sel = ann.selectedText ?? '';
  if (
    !range ||
    typeof range.start !== 'number' ||
    typeof range.end !== 'number' ||
    range.end <= range.start ||
    !sel
  ) {
    return null;
  }
  if (plain.slice(range.start, range.end) === sel) {
    return { start: range.start, end: range.end, status: 'NORMAL' };
  }
  const idx = plain.indexOf(sel);
  if (idx >= 0) {
    return { start: idx, end: idx + sel.length, status: 'RECOVERED' };
  }
  return { start: 0, end: 0, status: 'LOST' };
}
