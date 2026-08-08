"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useMyNotes, useReviewQueue, useCreateSession } from "@/lib/hooks";
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
  // 자기채점 대기 서술형(#39 B-2) — 리마인드만, 큐 편입은 하지 않는다(채점이 상태 전이의 입력).
  const ungradedCount = notes?.summary?.ungradedCount ?? 0;
  // 채점 이력이 서버 상한(500)에 걸려 잘렸는지(#39 B-3) — 잘린 표본이면 큐가 불완전할 수 있다.
  const truncated = notes?.truncated ?? false;
  // 마스터(복습 졸업) 문항은 기본 제외, 토글로 포함 — 이슈 #21 결정.
  const [includeMastered, setIncludeMastered] = useState(false);

  // 복습 큐 조립은 **서버가 한다**(GET /me/review-queue). 예전엔 여기서 /me/notes 전량을 받아
  // useMemo로 조립했는데, 그 응답은 채점 이력 상한(500)에 잘려서 오래 푼 사용자일수록
  // 복습해야 할 문항이 조용히 빠졌다. 경고(truncated)를 띄우긴 했지만 경고가 누락을 고치진 않는다.
  const { data: queue } = useReviewQueue({ ...applied, includeMastered });
  const picked = queue?.questionIds ?? [];
  const overflow = queue?.remaining ?? 0;

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
        {/* 서버 조회 상한 도달(#39 B-3). 이제 **통계에만** 해당한다 —
            복습 큐는 채점 이력이 아니라 복습 상태를 직접 읽으므로 상한과 무관하게 완전하다. */}
        {truncated && (
          <p className="mb-1 text-[11px] text-muted-foreground">
            아래 통계는 최근 채점분 기준이에요. 복습 큐는 전체 기록을 봅니다.
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
            {/* 큐가 이제 완전하므로 단정할 수 있다 — 예전엔 잘린 표본이라 말을 흐려야 했다.
                복습 대기 문항이 있는데 큐가 비었다면 간격이 아직 안 지난 것이다. */}
            {review && review.byStatus.X + review.byStatus.TRIANGLE > 0
              ? "예정된 복습이 아직 없어요. 간격(✗ 1일 · △ 3→7일 누진)이 지나면 다시 나옵니다."
              : "복습할 오답이 없어요."}
          </p>
        )}
      </section>
    </>
  );
}
