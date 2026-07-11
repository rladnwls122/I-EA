"use client";
import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { useReviews, useUpsertReview } from "@/lib/hooks";

function StarRow({
  value,
  onChange,
  color = "text-primary",
}: {
  value: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n}점`}
          className="p-0.5 transition-transform active:scale-90"
        >
          <Star
            size={18}
            className={n <= value ? `${color} fill-current` : "text-border"}
          />
        </button>
      ))}
    </div>
  );
}

/** 별점(품질 추천도) + 체감 난이도 평가. 사용자당 1건 upsert. */
export function RatingPanel({ questionId }: { questionId: string }) {
  const { data } = useReviews(questionId);
  const upsert = useUpsertReview();
  const [rating, setRating] = useState(0);
  const [difficulty, setDifficulty] = useState(0);

  const submit = () => {
    if (rating < 1) {
      toast.error("별점을 먼저 선택해주세요.");
      return;
    }
    upsert.mutate(
      {
        questionId,
        data: {
          rating,
          ...(difficulty >= 1 ? { perceivedDifficulty: difficulty } : {}),
        },
      },
      {
        onSuccess: () => toast.success("평가가 저장되었습니다."),
        onError: () => toast.error("평가 저장에 실패했습니다."),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          이 문제 평가하기
        </span>
        {data?.summary.averageRating != null && (
          <span className="font-mono text-[11px] text-muted-foreground">
            평균 ★{data.summary.averageRating}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">추천도</p>
            <p className="text-[11px] text-muted-foreground">문제 품질이 좋았나요?</p>
          </div>
          <StarRow value={rating} onChange={setRating} />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-foreground">체감 난이도</p>
            <p className="text-[11px] text-muted-foreground">1(쉬움) ~ 5(어려움)</p>
          </div>
          <StarRow value={difficulty} onChange={setDifficulty} color="text-wrong" />
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={upsert.isPending}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {upsert.isPending && <Loader2 size={14} className="animate-spin" />}
        평가 저장
      </button>
    </div>
  );
}
