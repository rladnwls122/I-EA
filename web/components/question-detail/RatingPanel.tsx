"use client";
import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
          className="flex h-8 w-8 items-center justify-center rounded-md transition-transform duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100"
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
    <div className="rounded-xl border border-border bg-card p-5 shadow-surface">
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

      <Button onClick={submit} disabled={upsert.isPending} className="mt-4 w-full">
        {upsert.isPending && <Loader2 size={14} className="animate-spin" />}
        평가 저장
      </Button>
    </div>
  );
}
