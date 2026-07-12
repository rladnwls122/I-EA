"use client";
import { Check, Sparkles } from "lucide-react";
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
    <div className="reward-pop mb-4 rounded-xl border border-border bg-card p-5 shadow-surface surface-sheen">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            점수
          </span>
          <span className="font-mono text-3xl font-semibold text-foreground">
            {scorePercent}%
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            정답
          </span>
          <span className="flex items-center gap-1 font-mono text-lg font-medium text-correct">
            <Check size={16} aria-hidden="true" />
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
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-streak/10 px-3 py-1.5 text-streak">
            <Sparkles size={14} aria-hidden="true" />
            <span className="font-mono text-sm font-medium tabular-nums">+{reward.gained} XP</span>
          </div>
        )}
      </div>
    </div>
  );
}
