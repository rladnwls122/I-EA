"use client";
import { BarChart3 } from "lucide-react";
import type { SessionAxisReport, SessionAxisBucket } from "@/lib/types";

/**
 * 세션 결과 축별 득점률 카드 — "이번 시험에서 어느 축에서 잃었나"(산타식 응시 직후 분석).
 * 오답노트의 전 기간 누적 축과 달리 방금 제출한 세션 하나가 모집단이다.
 * 축이 하나도 없으면(무키워드·무하위요소·전부 미채점) 카드 자체를 그리지 않는다.
 */
export function AxisReportCard({ report }: { report?: SessionAxisReport | null }) {
  if (!report || report.graded === 0) return null;
  const hasAxes =
    report.byKeyword.length > 0 ||
    report.bySubjectDetail.length > 0 ||
    report.byDifficulty.length > 1;
  if (!hasAxes) return null;

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4 shadow-surface">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <BarChart3 size={15} className="text-primary" aria-hidden="true" /> 축별 득점률
        </h2>
        {report.ungraded > 0 && (
          <span className="text-[11px] text-muted-foreground">
            미채점 {report.ungraded}문항 제외
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {report.bySubjectDetail.length > 0 && (
          <AxisGroup title="하위요소" buckets={report.bySubjectDetail} />
        )}
        {report.byKeyword.length > 0 && (
          <AxisGroup title="개념 키워드" buckets={report.byKeyword} />
        )}
        {report.byDifficulty.length > 1 && (
          <AxisGroup
            title="난이도"
            buckets={report.byDifficulty.map((d) => ({
              key: `diff-${d.difficulty}`,
              label: `난이도 ${d.difficulty}`,
              total: d.total,
              correct: d.correct,
            }))}
          />
        )}
      </div>
    </section>
  );
}

function AxisGroup({ title, buckets }: { title: string; buckets: SessionAxisBucket[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {buckets.map((b) => {
          const pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
          const weak = b.correct < b.total;
          return (
            <li key={b.key} className="flex items-center gap-2">
              <span className="w-28 flex-none truncate text-xs text-foreground" title={b.label}>
                {b.label}
              </span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
                role="img"
                aria-label={`${b.label} 득점률 ${pct}% (${b.correct}/${b.total})`}
              >
                <div
                  className={`h-full rounded-full ${weak ? "bg-wrong" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-14 flex-none text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {b.correct}/{b.total}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
