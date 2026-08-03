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

/** 서버 채점 이력 조회 상한 — 백엔드 me.service의 NOTES_GRADED_LIMIT와 동일해야 한다. */
const NOTES_GRADED_LIMIT = 500;

export default function NotesSidebarPage() {
  const router = useRouter();
  // 본문에서 확정한 조회 필터를 그대로 사용 — 복습 시작이 사용자가 보고 있는 범위와 일치해야 한다.
  const applied = useNotesFilterStore((s) => s.applied);
  const { data: notes } = useMyNotes(applied);
  const createSession = useCreateSession();
  const review = notes?.summary?.review;
  // 자기채점 대기 서술형(#39 B-2) — 리마인드만, 큐 편입은 하지 않는다(채점이 상태 전이의 입력).
  const ungradedCount = notes?.summary?.ungradedCount ?? 0;
  // 채점 이력이 서버 상한(500)에 걸려 잘렸는지(#39 B-3) — 잘린 표본이면 큐가 불완전할 수 있다.
  const truncated = notes?.truncated ?? false;
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
        {/* 미채점 서술형 리마인드 — 자기채점이 끝나야 복습 큐에 반영되므로 채점을 독촉만 한다. */}
        {ungradedCount > 0 && (
          <p className="mb-1 text-[11px] text-amber-600 dark:text-amber-400">
            자기채점을 기다리는 서술형{" "}
            <span className="font-mono font-semibold">{ungradedCount}</span>문항 — 풀이기록의 세션
            결과에서 채점하면 복습에 반영됩니다.
          </p>
        )}
        {overflow > 0 && (
          <p className="mb-1 text-[11px] text-muted-foreground">
            한 번에 {SESSION_MAX_QUESTIONS}문항까지 — 남은 {overflow}문항은 다음 복습에서 이어집니다.
          </p>
        )}
        {/* 서버 조회 상한 도달 — 통계·큐가 최근 기록 기준임을 알린다(#39 B-3). */}
        {truncated && (
          <p className="mb-1 text-[11px] text-muted-foreground">
            최근 채점 {NOTES_GRADED_LIMIT}건 기준입니다. 더 오래된 기록은 집계에서 제외됐어요.
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
              : // 잘린 표본에서는 오답이 더 있을 수 있으므로 단정하지 않는다.
                truncated
                ? `최근 채점 ${NOTES_GRADED_LIMIT}건에는 복습할 오답이 없어요.`
                : "복습할 오답이 없어요."}
          </p>
        )}
      </section>
    </>
  );
}
