"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSession, useSubmitSession } from "@/lib/hooks";
import { OmrPanel } from "./OmrPanel";
import { SolveQuestionCard } from "./SolveQuestionCard";
import { SolveBottomBar } from "./SolveBottomBar";
import { SubmitDialog } from "./SubmitDialog";
import { DrawingOverlay } from "./DrawingOverlay";

const Calculator = dynamic(
  () => import("./Calculator").then((m) => m.Calculator),
  { ssr: false },
);

export function SessionPage({ id }: { id: string }) {
  const { data: session, isLoading, isError } = useSession(id);
  const submitSession = useSubmitSession();

  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

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
      onSuccess: () => {
        setSubmitDialogOpen(false);
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
    // SUBMITTED — Task 12에서 결과 레이아웃으로 교체
    return (
      <div className="p-8 text-sm text-muted-foreground">
        결과 모드 — {session.questions.length}문항 (Task 12에서 완성)
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
      <div className="flex flex-1 gap-4 p-6">
        <div className="flex-1 grid grid-cols-1 gap-4 md:grid-cols-2">
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
