"use client";
import { ShieldCheck } from "lucide-react";
import { useReviewStats } from "@/lib/hooks";

/**
 * 출제 품질(AI 자기검증) 카드 — GET /ai-generations/review-stats의 화면(#33 잔여 마감).
 * 엔드포인트만 있고 보는 자리가 없으면 수치가 쌓여도 아무도 못 본다.
 * 판정이 하나도 없으면(출제 이력 없음·자기검증 꺼짐) 카드 자체를 그리지 않는다 —
 * 학습자 화면에 빈 출제 지표를 들이밀지 않는다.
 */
export function ReviewStatsCard({ enabled = true }: { enabled?: boolean }) {
  const { data } = useReviewStats(enabled);
  if (!data || data.reviewed === 0) return null;

  const judged = data.counts.PASS + data.counts.REVISE;
  const revisePct =
    data.reviseRatio != null ? Math.round(data.reviseRatio * 100) : null;
  const recentDays = data.byDay.slice(0, 5);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-surface md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ShieldCheck size={16} className="text-primary" aria-hidden="true" />
          출제 품질 · AI 자기검증
        </h2>
        {data.capped && (
          <span className="text-[11px] text-muted-foreground">최근 {data.sampled}건 기준</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 md:gap-6">
        <div>
          <p className="font-mono text-lg font-semibold text-foreground">{data.reviewed}</p>
          <p className="text-xs text-muted-foreground">판정된 문항</p>
        </div>
        <div>
          <p className="font-mono text-lg font-semibold text-correct">{data.counts.PASS}</p>
          <p className="text-xs text-muted-foreground">통과</p>
        </div>
        <div>
          <p className="font-mono text-lg font-semibold text-wrong">{data.counts.REVISE}</p>
          <p className="text-xs text-muted-foreground">수정 권고</p>
        </div>
        {data.counts.ERROR > 0 && (
          <div>
            <p className="font-mono text-lg font-semibold text-muted-foreground">
              {data.counts.ERROR}
            </p>
            <p className="text-xs text-muted-foreground">판정 실패</p>
          </div>
        )}
        {revisePct != null && judged > 0 && (
          <div>
            <p className="font-mono text-lg font-semibold text-foreground">{revisePct}%</p>
            <p className="text-xs text-muted-foreground">수정 권고율</p>
          </div>
        )}
      </div>

      {data.byAxis.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">자주 걸리는 축</p>
          <div className="flex flex-wrap gap-1.5">
            {data.byAxis.map((a) => (
              <span
                key={a.axis}
                className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-[11px] text-foreground"
              >
                {a.axis} <span className="font-mono text-muted-foreground">{a.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {recentDays.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">최근 추이</p>
          <ul className="flex flex-col gap-1">
            {recentDays.map((d) => (
              <li
                key={d.date}
                className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground"
              >
                <span>{d.date}</span>
                <span>
                  <span className="text-correct">통과 {d.pass}</span>
                  {" · "}
                  <span className="text-wrong">권고 {d.revise}</span>
                  {d.error > 0 ? ` · 실패 ${d.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
