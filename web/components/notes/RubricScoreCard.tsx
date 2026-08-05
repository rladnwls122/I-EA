"use client";
import { PenLine } from "lucide-react";
import type { RubricScore } from "@/lib/types";

/**
 * 서술형 득점률 카드 (#43 gap 8 후속).
 *
 * 서술형은 정오 하나로 접히기 전에 **부분점수**가 있고, 그 점수가 실력의 대부분을 말한다.
 * 정답률 카드가 "몇 개 맞았나"라면 이건 "받을 수 있던 점수 중 얼마를 받았나"다.
 * 60% 미만이 오답으로 접히므로(RUBRIC_PASS_RATIO), 정답률만 보면 "40%짜리 답안"과
 * "0점 답안"이 똑같이 오답 한 개로 보인다 — 그 차이를 보여주는 게 이 카드의 존재 이유다.
 *
 * 판정 규칙(표본 하한·비율 정의)은 **서버가 계산해 내려준다**(rubric-score.util).
 * 여기서 다시 계산하지 마라. score가 null이면 판정 불가(표본 부족·서술형 채점 이력 없음)라
 * 아무것도 띄우지 않는다 — 0%로 그리면 "다 틀렸다"는 거짓말이 된다.
 */
export function RubricScoreCard({ score }: { score: RubricScore | null | undefined }) {
  if (!score) return null;

  const percent = Math.round(score.ratio * 100);

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <PenLine size={16} className="text-purple" />
        <h2 className="text-sm font-semibold">서술형 득점률</h2>
        <span className="text-[11px] text-muted-foreground">
          1차 응시 기준 · 채점기준표로 채점한 답안만
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {percent}%
        </span>
        <div className="min-w-0 flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-purple transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
          {/* 비율 옆에 원점수와 표본을 병기한다 — "68%"만으로는 3문항인지 30문항인지 모른다. */}
          <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {score.earnedPoints}/{score.totalPoints}점 · {score.count}문항
          </p>
        </div>
      </div>
    </section>
  );
}
