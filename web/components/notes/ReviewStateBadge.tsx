import { Check, Star, Triangle, X } from "lucide-react";
import type { ReviewStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * 복습 상태 뱃지 — O(처음부터 맞음) / 세모(재도전 성공) / X(연속 틀림) / 마스터(복습 졸업).
 * 색+아이콘 이중 채널(색약 대응). 비인터랙티브 — 카드 전체가 <Link>인 목록 안에서도 안전.
 */
const STYLES: Record<
  ReviewStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  O: {
    label: "정복",
    className: "bg-correct/10 text-correct border-correct/30",
    Icon: Check,
  },
  TRIANGLE: {
    label: "극복 중",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
    Icon: Triangle,
  },
  X: {
    label: "집중 필요",
    className: "bg-wrong/10 text-wrong border-wrong/30",
    Icon: X,
  },
  MASTERED: {
    label: "마스터",
    className: "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400",
    Icon: Star,
  },
};

export function ReviewStateBadge({
  status,
  className,
}: {
  status: ReviewStatus;
  className?: string;
}) {
  const s = STYLES[status];
  if (!s) return null;
  const { Icon } = s;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        s.className,
        className,
      )}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden />
      {s.label}
    </span>
  );
}
