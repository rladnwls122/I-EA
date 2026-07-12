"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSession, useSubmitSession } from "@/lib/hooks";
import type { SubmitSessionResult } from "@/lib/types";
import { OmrPanel } from "./OmrPanel";
import { SolveQuestionCard } from "./SolveQuestionCard";
import { SolveBottomBar } from "./SolveBottomBar";
import { SubmitDialog } from "./SubmitDialog";
import { DrawingOverlay } from "./DrawingOverlay";
import { ResultBanner } from "./ResultBanner";
import { ResultQuestionCard } from "./ResultQuestionCard";

const Calculator = dynamic(
  () => import("./Calculator").then((m) => m.Calculator),
  { ssr: false },
);

export function SessionPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: session, isLoading, isError } = useSession(id);
  const submitSession = useSubmitSession();

  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  // 방금 제출한 응답(reward 포함) — 새로고침하면 사라지고 서버 재조회 값으로 대체된다.
  const [justSubmitted, setJustSubmitted] = useState<SubmitSessionResult | null>(null);

  // 서버에서 최초 로드된 답변 상태로 answeredIds를 초기화(한 번만).
  const initialized = useMemo(() => {
    if (!session) return false;
    setAnsweredIds((prev) => {
      if (prev.size > 0) return prev; // 이미 로컬 상태가 있으면(사용자가 조작 중) 덮지 않음
      const ids = session.questions
        .filter((q) => q.answer != null)
        .map((q) => q.sessionQuestionId);
      return new Set(ids);
    });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const handleAnswerStateChange = (sessionQuestionId: string, answered: boolean) => {
    setAnsweredIds((prev) => {
      const next = new Set(prev);
      if (answered) next.add(sessionQuestionId);
      else next.delete(sessionQuestionId);
      return next;
    });
  };

  const jumpTo = (sessionQuestionId: string) => {
    document
      .getElementById(`sq-${sessionQuestionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmit = () => {
    submitSession.mutate(id, {
      onSuccess: (result) => {
        setSubmitDialogOpen(false);
        setJustSubmitted(result);
        toast.success("제출 완료! 채점 결과를 확인하세요.");
      },
      onError: () => {
        toast.error("제출에 실패했어요. 다시 시도해주세요.");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">세션을 찾을 수 없어요.</p>
        <p className="text-xs text-muted-foreground">
          삭제되었거나 접근 권한이 없는 세션입니다.
        </p>
      </div>
    );
  }

  if (session.status === "EXPIRED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">만료된 세션이에요.</p>
        <p className="text-xs text-muted-foreground">
          제한 시간이 지나 더 이상 응시할 수 없습니다.
        </p>
      </div>
    );
  }

  if (session.status !== "IN_PROGRESS") {
    // SUBMITTED — 결과 모드
    const sortedQuestions = session.questions
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const total = session.questions.length;
    const correct = session.questions.filter((q) => q.answer?.isCorrect === true).length;
    const scorePercent = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;

    return (
      <div className="mx-auto max-w-5xl p-6">
        <ResultBanner
          total={justSubmitted?.total ?? total}
          correct={justSubmitted?.correct ?? correct}
          scorePercent={justSubmitted?.scorePercent ?? scorePercent}
          durationSec={justSubmitted?.durationSec ?? session.durationSec}
          reward={justSubmitted?.reward}
        />

        {/* 시험지 느낌 — 2열 사이 중앙 hairline (md 이상) */}
        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-10 md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:w-px md:before:bg-border">
          {sortedQuestions.map((q) => (
            <ResultQuestionCard
              key={q.sessionQuestionId}
              item={q}
              order={q.displayOrder}
              onSelfGraded={() => {
                /* useSelfGrade는 세션 쿼리를 자동 invalidate하지 않으므로
                   배너/카드 최신화를 위해 세션을 다시 조회한다. 자기채점 이후엔
                   서버 값이 정본이 되도록 방금-제출 스냅샷도 비운다. */
                setJustSubmitted(null);
                queryClient.invalidateQueries({ queryKey: ["session", id] });
              }}
            />
          ))}
        </div>

        <div className="fixed bottom-6 right-6 z-40 flex gap-2">
          <button
            type="button"
            onClick={() => setDrawingEnabled((v) => !v)}
            aria-pressed={drawingEnabled}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors ${
              drawingEnabled
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
            title="화면필기"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => setCalculatorOpen((v) => !v)}
            aria-pressed={calculatorOpen}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors ${
              calculatorOpen
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
            title="계산기"
          >
            🧮
          </button>
        </div>

        {drawingEnabled && <DrawingOverlay onClose={() => setDrawingEnabled(false)} />}
        {calculatorOpen && <Calculator onClose={() => setCalculatorOpen(false)} />}
      </div>
    );
  }

  void initialized;
  const omrItems = session.questions
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => ({ sessionQuestionId: q.sessionQuestionId, order: q.displayOrder }));

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 p-6">
        {/* 시험지 느낌 — 중앙 정렬 + 2열 사이 중앙 hairline (md 이상) */}
        <div className="relative flex-1 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-10 md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:w-px md:before:bg-border">
          {session.questions
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((q) => (
              <div key={q.sessionQuestionId} id={`sq-${q.sessionQuestionId}`}>
                <SolveQuestionCard
                  item={q}
                  order={q.displayOrder}
                  onAnswerStateChange={handleAnswerStateChange}
                />
              </div>
            ))}
        </div>
        <OmrPanel items={omrItems} answeredIds={answeredIds} onJump={jumpTo} />
      </div>

      <SolveBottomBar
        startedAt={session.startedAt}
        answeredCount={answeredIds.size}
        totalCount={session.questions.length}
        drawingEnabled={drawingEnabled}
        onToggleDrawing={() => setDrawingEnabled((v) => !v)}
        calculatorOpen={calculatorOpen}
        onToggleCalculator={() => setCalculatorOpen((v) => !v)}
        onRequestSubmit={() => setSubmitDialogOpen(true)}
      />

      <SubmitDialog
        open={submitDialogOpen}
        unansweredCount={session.questions.length - answeredIds.size}
        onConfirm={handleSubmit}
        onCancel={() => setSubmitDialogOpen(false)}
        isSubmitting={submitSession.isPending}
      />

      {drawingEnabled && <DrawingOverlay onClose={() => setDrawingEnabled(false)} />}
      {calculatorOpen && <Calculator onClose={() => setCalculatorOpen(false)} />}
    </div>
  );
}
