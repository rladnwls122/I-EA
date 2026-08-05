"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Target, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { useCreateSession } from "@/lib/hooks";
import type { WeaknessReport, Weakness } from "@/lib/types";

/** 약점 공략 세트 한 판의 문항 수. 한 자리에서 끝낼 수 있는 분량으로 잡는다. */
const ATTACK_SET_SIZE = 10;

/**
 * 약점 진단 카드 (#37).
 *
 * 진단 규칙(표본 하한·점수식·개념/훈련 분류)은 **서버가 계산해 내려준다**(weakness.util).
 * 여기서 다시 계산하지 마라 — 화면마다 다른 진단이 나온다.
 *
 * 이 카드의 존재 이유는 진단 그 자체가 아니라 **진단 → 행동** 연결이다.
 * "네 약점은 X다"로 끝나면 학습자가 할 게 없다. 그래서 카드마다 그 약점만 모은
 * 세션을 바로 만드는 버튼을 둔다(기존 `POST /exam-sessions` 필터 모드 재사용 — 신규 API 없음).
 */
export function WeaknessCard({
  report,
  subjectId,
}: {
  report: WeaknessReport | undefined;
  /** 현재 필터의 과목. 세션 조립에 필요하다 — 없으면 처방 버튼을 숨긴다. */
  subjectId?: string;
}) {
  const router = useRouter();
  const createSession = useCreateSession();
  const [pending, setPending] = useState<string | null>(null);

  const weaknesses = report?.weaknesses ?? [];
  const needsMoreData = report?.needsMoreData ?? [];

  if (weaknesses.length === 0 && needsMoreData.length === 0) return null;

  const attack = (w: Weakness) => {
    if (!subjectId) return;
    setPending(w.key);
    createSession.mutate(
      {
        subjectId,
        // 미분류 버킷은 실제 하위요소 id가 아니라 서버가 만든 표식이라 필터로 못 쓴다.
        ...(w.key === "UNCLASSIFIED" ? {} : { subjectDetailId: w.key }),
        questionCount: ATTACK_SET_SIZE,
      },
      {
        onSuccess: (res) => router.push(`/exam-sessions/${res.id}`),
        onError: (e) => {
          setPending(null);
          toast.error(
            e instanceof Error ? e.message : "세트를 만들지 못했어요. 문항이 부족할 수 있어요.",
          );
        },
      },
    );
  };

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <TrendingDown size={16} className="text-wrong" />
        <h2 className="text-sm font-semibold">약점 진단</h2>
        <span className="text-[11px] text-muted-foreground">
          1차 응시 기준 · 표본 5개 이상인 유형만
        </span>
      </div>

      {weaknesses.length > 0 ? (
        <ul className="space-y-2.5">
          {weaknesses.map((w) => (
            <li
              key={w.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{w.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      w.kind === "DRILL"
                        ? "bg-warning/10 text-warning"
                        : "bg-purple/10 text-purple"
                    }`}
                  >
                    {w.kind === "DRILL" ? "훈련 부족" : "개념 약점"}
                  </span>
                  {/*
                    복습 실패율 라벨 — 개념/훈련과 **겹치는 축이 아니라 나란히 붙는 축**이다.
                    개념/훈련은 "왜 틀렸나", 이건 "다시 풀려도 고쳐지나"를 말한다.
                    절반 이상 재오답이면(stuck) 처방이 달라진다 — 더 풀리는 게 아니라
                    접근법 자체를 다시 세워야 하는 축이라 눈에 띄게 표시한다.
                    판정 불가(전이 표본 부족)면 서버가 null을 내리므로 아무것도 안 뜬다.
                  */}
                  {w.reviewFailure?.stuck && (
                    <span className="flex items-center gap-1 rounded-full bg-wrong/10 px-1.5 py-0.5 text-[10px] font-medium text-wrong">
                      <RotateCcw size={9} />
                      복습에도 재오답
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  정답률 {w.accuracyPercent}% · {w.total}문항 중 {w.wrong}개 오답
                  {w.dominantReason && ` · 주원인 ${w.dominantReason.label}`}
                  {/* 비율만 쓰면 "3번 중 2번"이 "100번 중 66번"처럼 읽힌다 — 표본을 병기한다. */}
                  {w.reviewFailure &&
                    ` · 복습 재오답 ${w.reviewFailure.failed}/${w.reviewFailure.total}회(${Math.round(
                      w.reviewFailure.ratio * 100,
                    )}%)`}
                </p>
              </div>
              {subjectId && (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => attack(w)}
                  className="flex flex-none items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {pending === w.key ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Target size={12} />
                  )}
                  공략 {ATTACK_SET_SIZE}문항
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          아직 약점을 판정할 만큼 푼 유형이 없어요.
        </p>
      )}

      {needsMoreData.length > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          표본이 적어 판정을 미룬 유형:{" "}
          {needsMoreData.map((n) => `${n.label}(${n.total}문항)`).join(", ")} — 조금 더 풀면
          진단에 들어와요.
        </p>
      )}
    </section>
  );
}
