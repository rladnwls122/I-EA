import type { Question } from "@/lib/types";
import { Eye, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { extractPlainText } from "@/lib/prosemirror";

/** 큰 수를 1.2k 형태로. 데이터는 Geist Mono로 tabular하게 렌더된다. */
function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function QuestionCard({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  // 표본 10명 미만이면 정답률을 숨긴다 — 소표본 왜곡 방지 (백엔드 통계 정책과 동일).
  const total = question.totalSolvedCount ?? 0;
  const accuracy =
    total >= 10
      ? Math.round((question.correctSolvedCount / total) * 100)
      : null;

  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col rounded-xl border border-border bg-card p-5 text-left transition-all duration-150 hover:border-primary/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* 상단: 과목 · 유형  /  난이도 pip */}
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="secondary"
            className="shrink-0 font-mono text-[11px] font-medium text-muted-foreground"
          >
            {question.subject?.name || "과목 미지정"}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">
            {question.questionType}
          </span>
        </div>
        {/* 난이도 1~5 — 실제 척도이므로 pip으로 정직하게 표현 */}
        <div
          className="flex shrink-0 items-center gap-1"
          aria-label={`난이도 ${question.difficulty}`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`h-1.5 w-1.5 rounded-full ${
                n <= question.difficulty ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* 제목 */}
      <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
        {question.searchText || extractPlainText(question.stem)}
      </h3>

      {/* 태그 */}
      {question.tags && question.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-1">
          {question.tags.slice(0, 3).map((tag) => (
            <span key={tag.id} className="text-xs text-muted-foreground">
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {/* 스탯행 — 유지 정보요소(정답률·조회·풀이수). Geist Mono. */}
      <div className="mt-4 flex items-end justify-between border-t border-border pt-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            정답률
          </span>
          {accuracy !== null ? (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {accuracy}%
              </span>
              <span
                className="h-[3px] w-14 overflow-hidden rounded-full bg-border"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${accuracy}%` }}
                />
              </span>
            </div>
          ) : (
            <span className="font-mono text-sm text-muted-foreground">—</span>
          )}
        </div>

        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="flex items-center gap-1.5" title="조회수">
            <Eye size={13} strokeWidth={2} />
            {fmt(question.viewCount ?? 0)}
          </span>
          <span className="flex items-center gap-1.5" title="풀이 수">
            <Users size={13} strokeWidth={2} />
            {fmt(total)}
          </span>
        </div>
      </div>
    </button>
  );
}
