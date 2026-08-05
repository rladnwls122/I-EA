"use client";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import type { SelfReviewNote } from "@/lib/types";

/**
 * AI 자기검증 결과(#34) — **출제자에게만** 보인다.
 *
 * 검증은 생성 시점에 돌고 결과를 `questions.metadata.review`에 남기지만, 지금까지 그 기록을
 * 읽는 화면이 없었다. 검증을 켜도 아무도 보지 못하면 켤 이유가 없다.
 *
 * 서버가 출제자가 아닌 요청자에게는 이 필드를 아예 떼고 내려준다(`stripInternalReview`) —
 * 지적 사항이 "3번 선지가 정답과 의미가 겹친다" 같은 문장이라, 읽으면 소거법으로 정답이
 * 좁혀지기 때문이다. 그래서 이 컴포넌트는 값이 오면 그릴 뿐 권한을 다시 따지지 않는다.
 */

/** 판정별 표시 규약 — verdict는 서버가 정한 세 값뿐이다. */
const VERDICT_STYLE = {
  PASS: {
    icon: CheckCircle2,
    label: "AI 검수 통과",
    tone: "border-correct/40 bg-correct/5 text-correct",
  },
  REVISE: {
    icon: AlertTriangle,
    label: "AI 검수 — 손볼 곳 있음",
    tone: "border-wrong/40 bg-wrong/5 text-wrong",
  },
  // "통과"와 뚜렷이 구분한다 — 판정을 못 한 것을 통과로 읽으면 검수가 있으나 마나 해진다.
  ERROR: {
    icon: HelpCircle,
    label: "AI 검수 — 판정하지 못함",
    tone: "border-border bg-surface-raised text-muted-foreground",
  },
} as const;

export function SelfReviewPanel({ review }: { review?: SelfReviewNote | null }) {
  if (!review) return null;
  const style = VERDICT_STYLE[review.verdict] ?? VERDICT_STYLE.ERROR;
  const Icon = style.icon;

  return (
    <section className={`rounded-xl border p-4 ${style.tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon size={15} strokeWidth={2} />
        {style.label}
      </div>

      {/* 지적된 축 — 무엇이 걸렸는지 한눈에. PASS면 축이 없다. */}
      {review.axes && review.axes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {review.axes.map((axis) => (
            <span
              key={axis}
              className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-medium"
            >
              {axis}
            </span>
          ))}
        </div>
      )}

      {review.issues && review.issues.length > 0 && (
        <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-foreground/80">
          {review.issues.map((issue, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="select-none text-muted-foreground">·</span>
              {issue}
            </li>
          ))}
        </ul>
      )}

      {/* 언제·어느 모델이 봤는지. 프롬프트나 모델이 바뀌면 옛 판정은 근거가 약해진다. */}
      <p className="mt-2.5 font-mono text-[10px] text-muted-foreground">
        {review.model} · {new Date(review.at).toLocaleString("ko-KR")}
      </p>
    </section>
  );
}
