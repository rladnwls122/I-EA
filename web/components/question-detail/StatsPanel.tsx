"use client";
import { useQuestionStats } from "@/lib/hooks";

function formatAvgTime(sec: number | null): string {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 정답률·평균소요·선지 분포 패널. reveal(채점결과)일 때만 부모가 렌더한다.
 * 표본 부족(rate/avg null)이면 "표본 부족" 표기, 분포는 그대로 노출.
 */
export function StatsPanel({ questionId }: { questionId: string }) {
  const { data: stats, isLoading } = useQuestionStats(questionId);

  if (isLoading) {
    return (
      <div className="h-[140px] animate-pulse rounded-xl border border-border bg-surface-raised" />
    );
  }
  if (!stats) return null;

  const dist = stats.choiceDistribution || [];
  const totalPicks = dist.reduce((sum, d) => sum + d.count, 0);
  // 매력 오답: 오답 중 가장 많이 선택된 선지(표본 있을 때만)
  const decoy = dist
    .filter((d) => !d.isCorrect && d.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          정답률 · 통계
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          응시 {stats.totalSolved.toLocaleString()}명
        </span>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full flex-none sm:w-[140px]">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-semibold text-foreground">
              {stats.correctRate != null ? stats.correctRate : "—"}
            </span>
            {stats.correctRate != null && (
              <span className="text-sm font-semibold text-muted-foreground">%</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.correctRate != null ? "정답률" : "표본 부족"}
          </p>
          <div className="mt-4 flex gap-4">
            <div>
              <p className="font-mono text-sm font-semibold text-foreground">
                {formatAvgTime(stats.avgTimeSpentSec)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">평균 소요</p>
            </div>
            {decoy && (
              <div>
                <p className="font-mono text-sm font-semibold text-wrong">
                  {decoy.index + 1}번
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">매력 오답</p>
              </div>
            )}
          </div>
        </div>

        {dist.length > 0 && (
          <div className="flex flex-1 flex-col justify-center gap-2">
            {dist.map((d) => {
              const pct = totalPicks > 0 ? Math.round((d.count / totalPicks) * 100) : 0;
              return (
                <div key={d.index} className="flex items-center gap-2.5">
                  <span
                    className={`w-5 text-right font-mono text-[11px] ${
                      d.isCorrect ? "font-semibold text-correct" : "text-muted-foreground"
                    }`}
                  >
                    {d.index + 1}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                    <div
                      className={`h-full rounded-full ${d.isCorrect ? "bg-correct" : "bg-border"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
