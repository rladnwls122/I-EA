"use client";
import { Sparkles } from "lucide-react";
import type { SubmitReward } from "@/lib/types";

function formatDuration(sec: number | null): string {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}

export function ResultBanner({
  total,
  correct,
  scorePercent,
  durationSec,
  reward,
}: {
  total: number;
  correct: number;
  scorePercent: number;
  durationSec: number | null;
  reward?: SubmitReward | null;
}) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            점수
          </span>
          <span className="font-mono text-2xl font-semibold text-foreground">
            {scorePercent}%
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            정답
          </span>
          <span className="font-mono text-lg font-medium text-foreground">
            {correct}/{total}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            소요 시간
          </span>
          <span className="font-mono text-lg font-medium text-foreground">
            {formatDuration(durationSec)}
          </span>
        </div>
        {reward && reward.gained > 0 && (
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-primary">
            <Sparkles size={14} />
            <span className="text-sm font-medium">+{reward.gained} XP</span>
          </div>
        )}
      </div>
    </div>
  );
}
