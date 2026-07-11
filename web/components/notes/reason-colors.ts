/**
 * 오답원인 코드별 의미색 — emerald(행동)와 red(오답 수치)는 여기 쓰지 않는다.
 * 개념부족=보라(깊은 재학습), 실수=호박(주의), 시간부족=파랑(페이스), 기타=중립.
 * NotesDashboard(도넛)와 대시보드 요약(바)이 공유한다.
 */
export const REASON_COLORS: Record<string, string> = {
  CONCEPT: "#a78bfa",
  MISTAKE: "#fbbf24",
  TIME: "#60a5fa",
  OTHER: "#888e95",
};

export const FALLBACK_COLORS = ["#a78bfa", "#fbbf24", "#60a5fa", "#888e95", "#f472b6"];

export function reasonColor(code: string, index: number): string {
  return REASON_COLORS[code] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}
