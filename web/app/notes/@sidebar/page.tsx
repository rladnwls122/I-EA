"use client";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useMyNotes, useCreateSession } from "@/lib/hooks";
import { useNotesFilterStore } from "@/lib/notes-filter-store";
import { Button } from "@/components/ui/button";

const VegaStatWidget = dynamic(
  () => import("@/components/notes/VegaStatWidget").then((mod) => mod.VegaStatWidget),
  { ssr: false },
);

export default function NotesSidebarPage() {
  const router = useRouter();
  // 본문에서 확정한 조회 필터를 그대로 사용 — 복습 시작이 사용자가 보고 있는 범위와 일치해야 한다.
  const applied = useNotesFilterStore((s) => s.applied);
  const { data: notes } = useMyNotes(applied);
  const createSession = useCreateSession();
  const review = notes?.summary?.review;

  // 같은 문항이 여러 세션에서 오답이면 중복 — 제거 후 조립.
  // 포함 규칙: 복습 기록 없는 구데이터는 포함, 있으면 예정일 도래분만 —
  // 방금 틀린 문항을 즉시 재출제하면 간격 스케줄(X=1일·세모=3일)이 무력화된다.
  // MASTERED는 nextReviewAt=null이라 자연히 제외.
  const now = Date.now();
  const wrongIds = Array.from(
    new Set(
      (notes?.wrongQuestions || [])
        .filter(
          (q) =>
            !q.reviewState ||
            (q.reviewState.nextReviewAt != null &&
              new Date(q.reviewState.nextReviewAt).getTime() <= now),
        )
        .map((q) => q.questionId),
    ),
  );

  const startReview = () => {
    if (wrongIds.length === 0) return;
    createSession.mutate(
      { questionIds: wrongIds, isReview: true },
      {
        onSuccess: (res) => router.push(`/exam-sessions/${res.id}`),
        onError: () => toast.error("복습 세션 생성에 실패했습니다."),
      },
    );
  };

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-5 shadow-surface">
        <h3 className="mb-1 text-[15px] font-semibold">오답 원인 분석</h3>
        <p className="mb-4 text-xs text-muted-foreground">최근 기록한 원인 태그 통계입니다.</p>
        <VegaStatWidget />
      </section>

      <section className="flex flex-col items-start rounded-xl border border-border bg-card p-6 shadow-surface">
        <span className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Next step</span>
        <h3 className="mb-2 text-[15px] font-semibold leading-snug">
          기록한 오답을 다시 풀어보세요.
        </h3>
        {review && (
          <p className="mb-4 text-xs text-muted-foreground">
            오늘 복습 <span className="font-mono font-semibold text-foreground">{review.due}</span>문항
            {(review.byStatus.X > 0 || review.byStatus.TRIANGLE > 0) && (
              <span className="ml-1.5 font-mono text-[11px]">
                (✗ {review.byStatus.X} · △ {review.byStatus.TRIANGLE})
              </span>
            )}
          </p>
        )}
        <Button
          onClick={startReview}
          disabled={wrongIds.length === 0 || createSession.isPending}
        >
          {createSession.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          복습 시작 <ArrowUpRight size={16} strokeWidth={2} />
        </Button>
        {wrongIds.length === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">복습할 오답이 없어요.</p>
        )}
      </section>
    </>
  );
}
