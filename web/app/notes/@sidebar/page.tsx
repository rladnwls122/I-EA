"use client";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useMyNotes, useCreateSession } from "@/lib/hooks";

const VegaStatWidget = dynamic(
  () => import("@/components/notes/VegaStatWidget").then((mod) => mod.VegaStatWidget),
  { ssr: false },
);

export default function NotesSidebarPage() {
  const router = useRouter();
  const { data: notes } = useMyNotes();
  const createSession = useCreateSession();

  // 같은 문항이 여러 세션에서 오답이면 중복 — 제거 후 조립
  const wrongIds = Array.from(
    new Set((notes?.wrongQuestions || []).map((q) => q.questionId)),
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
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-[15px] mb-1">오답 원인 분석</h3>
        <p className="text-xs text-muted-foreground mb-4">최근 기록한 원인 태그 통계입니다.</p>
        <VegaStatWidget />
      </section>

      <section className="bg-card border border-border rounded-xl p-6 flex flex-col items-start">
        <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">Next step</span>
        <h3 className="text-[15px] font-semibold leading-snug mb-5">
          기록한 오답을 다시 풀어보세요.
        </h3>
        <button
          type="button"
          onClick={startReview}
          disabled={wrongIds.length === 0 || createSession.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {createSession.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : null}
          복습 시작 <ArrowUpRight size={16} strokeWidth={2} />
        </button>
        {wrongIds.length === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">복습할 오답이 없어요.</p>
        )}
      </section>
    </>
  );
}
