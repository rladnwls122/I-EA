"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Target } from "lucide-react";
import { toast } from "sonner";
import { useCreateSession } from "@/lib/hooks";
import type { RubricScore } from "@/lib/types";

/**
 * 서술형 공략 세트 한 판의 문항 수. 약점 진단(10문항)보다 적다 —
 * 서술형 한 문항은 쓰는 시간도, 자기채점하는 시간도 객관식과 자릿수가 다르다.
 */
const ESSAY_SET_SIZE = 5;

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
export function RubricScoreCard({
  score,
  subjectId,
}: {
  score: RubricScore | null | undefined;
  /** 현재 필터의 과목. 세션 조립에 필요하다 — 없으면 처방 버튼을 숨긴다(약점 진단과 같은 규칙). */
  subjectId?: string;
}) {
  const router = useRouter();
  const createSession = useCreateSession();
  const [pending, setPending] = useState<string | null>(null);

  if (!score) return null;

  const percent = Math.round(score.ratio * 100);
  const byDetail = score.byDetail ?? [];
  const needsMoreData = score.needsMoreData ?? [];
  // 축이 하나뿐이면 전체와 같은 숫자를 두 번 그리는 셈이라 분해를 접는다.
  const showAxes = byDetail.length > 1;

  /**
   * 진단 → 행동 (#33 잔여 2). 약점 진단 카드와 **같은 문법**이다 —
   * 축을 보여 주고 끝내면 학습자가 할 게 없다.
   * `rubricOnly`가 서술형만 남기므로 이 세트의 모집단은 위 득점률과 같은 집합이다.
   */
  const attack = (key: string) => {
    if (!subjectId) return;
    setPending(key);
    createSession.mutate(
      {
        subjectId,
        // 미분류 버킷은 실제 하위요소 id가 아니라 서버 표식이라 필터로 못 쓴다.
        filter: { ...(key === "UNCLASSIFIED" ? {} : { subjectDetailId: key }), rubricOnly: true },
        questionCount: ESSAY_SET_SIZE,
      },
      {
        onSuccess: (res) => router.push(`/exam-sessions/${res.id}`),
        onError: (e) => {
          setPending(null);
          toast.error(
            e instanceof Error ? e.message : "세트를 만들지 못했어요. 서술형 문항이 부족할 수 있어요.",
          );
        },
      },
    );
  };

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

      {/*
        분류축별 분해 (#33 도그푸딩 잔여 2).
        전체 득점률은 "서술형이 약하다"까지만 말한다. 어디를 손볼지는 축이 말해야 하고,
        서버가 **낮은 순**으로 정렬해 주므로 화면은 순서를 다시 정하지 않는다(첫 줄이 곧 다음 할 일).
      */}
      {showAxes && (
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {byDetail.map((axis) => {
            const axisPercent = Math.round(axis.ratio * 100);
            return (
              <li key={axis.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-foreground/80" title={axis.label}>
                  {axis.label}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-purple/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${axisPercent}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {axisPercent}% · {axis.count}문항
                </span>
                {subjectId && (
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => attack(axis.key)}
                    aria-label={`${axis.label} 서술형 ${ESSAY_SET_SIZE}문항 공략`}
                    className="flex flex-none items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity disabled:opacity-50"
                  >
                    {pending === axis.key ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Target size={11} />
                    )}
                    {ESSAY_SET_SIZE}문항
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 표본이 모자란 축 — 숨기면 "내가 푼 서술형은 어디 갔지"가 된다(약점 진단과 같은 문법). */}
      {needsMoreData.length > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          표본이 적어 판정을 미룬 유형:{" "}
          {needsMoreData.map((n) => `${n.label}(${n.count}문항)`).join(", ")} — 조금 더 풀면
          여기에 들어와요.
        </p>
      )}
    </section>
  );
}
