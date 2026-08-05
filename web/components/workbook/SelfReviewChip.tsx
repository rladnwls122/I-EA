"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { SelfReviewNote } from "@/lib/types";

/**
 * AI 자기검증 배지 — 출제 중인 문항 옆 (#33 도그푸딩 잔여 1).
 *
 * 검증(#34)은 지금까지 비동기 생성 파이프라인에만 붙어 있었고, 그 결과를 읽는 화면은
 * 문항 상세의 `SelfReviewPanel` 하나뿐이었다. 그런데 **고칠 마음이 있는 시점**은
 * 문항 상세를 열 때가 아니라 지금 — AI가 막 만든 문항을 훑으며 적용할지 정하는 이 순간이다.
 * 그래서 판정을 채팅 제안과 캔버스 카드에 같은 모양으로 붙인다.
 *
 * 세 상태를 **뚜렷이** 구분한다:
 *  - `undefined`(기다리는 중): 문항은 이미 떴고 판정만 오는 중. 스피너.
 *  - `null`(판정 없음): 자기검증이 꺼져 있거나 판정에 실패했다. **아무것도 그리지 않는다** —
 *    "검수함"이라고 말할 근거가 없는데 자리를 차지하면 통과처럼 읽힌다.
 *  - 값 있음: PASS는 조용한 한 줄, REVISE는 펼쳐 볼 수 있는 지적 목록.
 *
 * PASS를 눈에 띄게 만들지 않는 이유: 통과는 기본값이라 강조하면 화면이 초록 배지로 뒤덮이고
 * 정작 봐야 할 REVISE가 묻힌다. 시선은 손볼 것에만 가야 한다.
 */
export function SelfReviewChip({
  review,
  className = "",
}: {
  review: SelfReviewNote | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (review === undefined) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] text-muted-foreground ${className}`}
      >
        <Loader2 size={10} className="animate-spin motion-reduce:animate-none" />
        AI 검수 중
      </span>
    );
  }
  if (!review) return null;

  // 판정을 못 한 기록(ERROR)도 통과로 보이면 안 되지만, 출제 중 화면에서 "판정 실패"를
  // 배지로 띄우면 사용자가 할 수 있는 일이 없다 — 조용히 숨긴다(기록은 문항 상세에 남는다).
  if (review.verdict === "ERROR") return null;

  if (review.verdict === "PASS") {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-correct ${className}`}>
        <CheckCircle2 size={10} strokeWidth={2.5} />
        AI 검수 통과
      </span>
    );
  }

  const issues = review.issues ?? [];
  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full bg-wrong/10 px-1.5 py-0.5 text-[10px] font-medium text-wrong transition-opacity hover:opacity-80"
      >
        <AlertTriangle size={10} strokeWidth={2.5} />
        AI 검수 — 손볼 곳 {issues.length > 0 ? issues.length : ""}
      </button>
      {open && (
        <span className="block rounded-lg border border-wrong/30 bg-wrong/5 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/80">
          {/* 지적된 축을 먼저 — "무엇이 걸렸는지"가 한 줄로 보여야 고칠지 말지 정한다. */}
          {review.axes && review.axes.length > 0 && (
            <span className="mb-1 flex flex-wrap gap-1">
              {review.axes.map((axis) => (
                <span key={axis} className="rounded bg-background/60 px-1 py-0.5 text-[10px]">
                  {axis}
                </span>
              ))}
            </span>
          )}
          {issues.map((issue, i) => (
            <span key={i} className="block">
              · {issue}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
