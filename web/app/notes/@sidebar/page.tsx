"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useMyNotes, useCreateSession } from "@/lib/hooks";
import { useNotesFilterStore } from "@/lib/notes-filter-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const VegaStatWidget = dynamic(
  () => import("@/components/notes/VegaStatWidget").then((mod) => mod.VegaStatWidget),
  { ssr: false },
);

/** 한 세션 최대 문항 수 — 백엔드 CreateSessionDto의 SESSION_MAX_QUESTIONS와 동일해야 한다. */
const SESSION_MAX_QUESTIONS = 100;

export default function NotesSidebarPage() {
  const router = useRouter();
  // 본문에서 확정한 조회 필터를 그대로 사용 — 복습 시작이 사용자가 보고 있는 범위와 일치해야 한다.
  const applied = useNotesFilterStore((s) => s.applied);
  const { data: notes } = useMyNotes(applied);
  const createSession = useCreateSession();
  const review = notes?.summary?.review;
  // 마스터(복습 졸업) 문항은 기본 제외, 토글로 포함 — 이슈 #21 결정.
  const [includeMastered, setIncludeMastered] = useState(false);

  const wrongQuestions = notes?.wrongQuestions;

  // 복습 큐 조립. 포함 규칙:
  //   - 복습 기록 없는 구데이터: 포함(아직 한 번도 스케줄되지 않은 오답)
  //   - X / 세모: 재노출 예정일이 도래한 것만 — 방금 틀린 문항을 즉시 재출제하면
  //     간격 스케줄(X=1일 · 세모=3일)이 무력화된다.
  //   - 마스터: 토글이 켜졌을 때만
  //   - O(처음부터 맞음): 제외
  // 정렬은 급한 순 — 예정일 도래분(오래 밀린 순) → 기록 없음 → 마스터.
  const queue = useMemo(() => {
    const now = Date.now();
    const seen = new Set<string>();
    const rows: { questionId: string; rank: number; dueAt: number }[] = [];

    for (const q of wrongQuestions || []) {
      // 같은 문항이 여러 세션에서 오답이면 중복 — 첫 행만 남긴다.
      if (seen.has(q.questionId)) continue;
      const st = q.reviewState;

      if (!st) {
        rows.push({ questionId: q.questionId, rank: 1, dueAt: 0 });
      } else if (st.status === "MASTERED") {
        if (includeMastered) rows.push({ questionId: q.questionId, rank: 2, dueAt: 0 });
      } else if (st.nextReviewAt != null) {
        const dueAt = new Date(st.nextReviewAt).getTime();
        if (dueAt <= now) rows.push({ questionId: q.questionId, rank: 0, dueAt });
      }
      seen.add(q.questionId);
    }

    rows.sort((a, b) => a.rank - b.rank || a.dueAt - b.dueAt);
    return rows.map((r) => r.questionId);
  }, [wrongQuestions, includeMastered]);

  // 세션 상한을 넘는 큐는 급한 순으로 잘라 담는다(초과분은 다음 복습에서 이어서).
  const picked = queue.slice(0, SESSION_MAX_QUESTIONS);
  const overflow = queue.length - picked.length;

  const startReview = () => {
    if (picked.length === 0) return;
    createSession.mutate(
      { questionIds: picked, isReview: true },
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
        {/* 이번에 담길 문항 수를 그대로 보여준다 — summary.review.due는 필터 무관 전체 기준이라
            현재 화면 범위에서 실제로 시작되는 세트와 어긋난다. */}
        <p className="mb-1 text-xs text-muted-foreground">
          지금 복습 <span className="font-mono font-semibold text-foreground">{picked.length}</span>문항
          {review && (review.byStatus.X > 0 || review.byStatus.TRIANGLE > 0) && (
            <span className="ml-1.5 font-mono text-[11px]">
              (✗ {review.byStatus.X} · △ {review.byStatus.TRIANGLE})
            </span>
          )}
        </p>
        {overflow > 0 && (
          <p className="mb-1 text-[11px] text-muted-foreground">
            한 번에 {SESSION_MAX_QUESTIONS}문항까지 — 남은 {overflow}문항은 다음 복습에서 이어집니다.
          </p>
        )}
        {review && review.byStatus.MASTERED > 0 && (
          <button
            type="button"
            onClick={() => setIncludeMastered((v) => !v)}
            aria-pressed={includeMastered}
            className={cn(
              "mb-3 mt-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              includeMastered
                ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            마스터 {review.byStatus.MASTERED}문항 {includeMastered ? "포함 중" : "포함하기"}
          </button>
        )}
        <Button
          className={review && review.byStatus.MASTERED > 0 ? undefined : "mt-3"}
          onClick={startReview}
          disabled={picked.length === 0 || createSession.isPending}
        >
          {createSession.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          복습 시작 <ArrowUpRight size={16} strokeWidth={2} />
        </Button>
        {picked.length === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {(wrongQuestions?.length ?? 0) > 0
              ? "예정된 복습이 아직 없어요. 간격(✗ 1일 · △ 3일)이 지나면 다시 나옵니다."
              : "복습할 오답이 없어요."}
          </p>
        )}
      </section>
    </>
  );
}
