"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Calculator as CalculatorIcon, LogOut, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSession, useSubmitSession, useWorkbooks } from "@/lib/hooks";
import type { SubmitSessionResult } from "@/lib/types";
import { OmrPanel } from "./OmrPanel";
import { SolveQuestionCard } from "./SolveQuestionCard";
import { SolveBottomBar } from "./SolveBottomBar";
import { SubmitDialog } from "./SubmitDialog";
import { DrawingOverlay } from "./DrawingOverlay";
import { ResultBanner } from "./ResultBanner";
import { ResultQuestionCard } from "./ResultQuestionCard";
import { BoxRewardCard } from "./BoxRewardCard";
import { WorkbookCard } from "@/components/workbook/WorkbookCard";
import { WorkbookPreviewSidebar } from "@/components/workbook/WorkbookPreviewSidebar";

const Calculator = dynamic(
  () => import("./Calculator").then((m) => m.Calculator),
  { ssr: false },
);

export function SessionPage({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isLoading, isError } = useSession(id);
  const submitSession = useSubmitSession();

  // 결과 화면 하단 추천 — 방금 푼 세션과 같은 과목의 인기 공개 문제집(과목 없으면 전체 인기).
  // 훅 규칙상 최상단에서 호출하고, 결과 모드일 때만 enabled로 실제 조회한다.
  const isResult = !!session && session.status !== "IN_PROGRESS";
  const recWorkbooks = useWorkbooks(
    {
      visibility: "PUBLIC",
      sort: "popular",
      subjectId: session?.subject?.id,
      limit: 5, // 자기 자신 1개 제외해도 최대 4개가 남도록 넉넉히 받는다.
    },
    isResult,
  );
  // 추천 카드 클릭 시 열리는 미리보기 사이드바(결과 모드 전용).
  const [recPreviewId, setRecPreviewId] = useState<string | null>(null);

  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  // 객관식 선택 상태의 단일 소스 — 문제카드와 답안지 OMR이 함께 읽고 쓴다.
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<string, string>>({});
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [omrOpen, setOmrOpen] = useState(false);
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
    // 객관식 기존 선택을 공유 상태로 복원(한 번만).
    setObjectiveAnswers((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, string> = {};
      for (const q of session.questions) {
        const cid = q.answer?.selectedChoiceIds?.[0];
        if (q.snapshot.questionType === "객관식" && cid) {
          next[q.sessionQuestionId] = cid;
        }
      }
      return next;
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

  // 객관식 선택(문제카드·답안지 OMR 공용). 저장(submit)은 클릭한 쪽이 각자 수행한다.
  const handleObjectiveSelect = (sessionQuestionId: string, choiceId: string) => {
    setObjectiveAnswers((prev) => ({ ...prev, [sessionQuestionId]: choiceId }));
    handleAnswerStateChange(sessionQuestionId, true);
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
    // 실제 풀이 레이아웃 모양의 스켈레톤 — 상단 진행 스트립 + 문항 카드 자리
    return (
      <div className="mx-auto w-full max-w-[680px] p-4 md:p-6">
        <Skeleton className="mb-6 h-1.5 w-full rounded-full" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-surface">
              <Skeleton className="mb-4 h-4 w-24" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="mb-5 h-4 w-3/4" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-[52px] w-full rounded-lg" />
                <Skeleton className="h-[52px] w-full rounded-lg" />
                <Skeleton className="h-[52px] w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
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

    // 방금 푼 문제집 자체는 추천에서 빼고 최대 4개만 노출.
    const recItems = (recWorkbooks.data?.items ?? [])
      .filter((wb) => wb.id !== session.workbookId)
      .slice(0, 4);

    return (
      <div className="mx-auto w-full max-w-[680px] p-4 md:p-6">
        {/* 상단 우측 — 결과 확인 후 문제집 탐색으로 나가기 */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">채점 결과</h1>
          <Button onClick={() => router.push("/workbook")}>
            <LogOut size={15} className="mr-1.5" /> 확인하고 나가기
          </Button>
        </div>

        <ResultBanner
          total={justSubmitted?.total ?? total}
          correct={justSubmitted?.correct ?? correct}
          scorePercent={justSubmitted?.scorePercent ?? scorePercent}
          durationSec={justSubmitted?.durationSec ?? session.durationSec}
          reward={justSubmitted?.reward}
        />

        {/* 제출 보상으로 상자를 받았으면 결과 배너 바로 아래 노출 — 새로고침하면 justSubmitted가
            비어 사라진다(이미 개봉했더라도 재조회 값엔 상자 여부가 없으므로 자연히 숨겨짐). */}
        {justSubmitted?.box && <BoxRewardCard box={justSubmitted.box} />}

        {/* focus-width 단일 컬럼 — 결과 복기도 위에서 아래로 한 흐름 */}
        <div className="flex flex-col gap-4">
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

        {/* 하단 추천 — 방금 푼 과목의 다른 인기 문제집. 카드 클릭 시 미리보기 사이드바. */}
        {recItems.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-primary" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                이런 문제집은 어때요?
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {recItems.map((wb) => (
                <WorkbookCard
                  key={wb.id}
                  wb={wb}
                  onClick={() => setRecPreviewId(wb.id)}
                />
              ))}
            </div>
          </section>
        )}

        <WorkbookPreviewSidebar
          workbookId={recPreviewId}
          onClose={() => setRecPreviewId(null)}
        />

        <div className="fixed bottom-20 right-4 z-40 flex gap-2 md:bottom-6 md:right-6">
          <button
            type="button"
            onClick={() => setDrawingEnabled((v) => !v)}
            aria-pressed={drawingEnabled}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              drawingEnabled
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            title="화면필기"
          >
            <Pencil size={17} />
          </button>
          <button
            type="button"
            onClick={() => setCalculatorOpen((v) => !v)}
            aria-pressed={calculatorOpen}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              calculatorOpen
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            title="계산기"
          >
            <CalculatorIcon size={17} />
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
    .map((q) => ({
      sessionQuestionId: q.sessionQuestionId,
      order: q.displayOrder,
      questionType: q.snapshot.questionType,
      choiceIds: (q.snapshot.choices ?? []).map((c) => c.id),
      selectedChoiceId: objectiveAnswers[q.sessionQuestionId] ?? null,
    }));

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 상시 노출 — 진행률 스트립(전역 상태). 풀이 중 어디서든 보인다. */}
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[960px] items-center gap-3 px-4 py-2.5 md:px-6">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-swift"
              style={{
                width: `${
                  session.questions.length > 0
                    ? (answeredIds.size / session.questions.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <span className="flex-none font-mono text-xs tabular-nums text-muted-foreground">
            {answeredIds.size}/{session.questions.length}
          </span>
        </div>
      </div>

      {/* 문항 2열 배치(md 이상). 답안지는 하단 드로어로 분리 → 본문은 전체 폭 사용. */}
      <div className="mx-auto w-full max-w-[960px] flex-1 p-4 pb-40 md:p-6 md:pb-28">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {session.questions
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((q) => (
              <div key={q.sessionQuestionId} id={`sq-${q.sessionQuestionId}`}>
                <SolveQuestionCard
                  item={q}
                  order={q.displayOrder}
                  onAnswerStateChange={handleAnswerStateChange}
                  selectedId={objectiveAnswers[q.sessionQuestionId] ?? null}
                  onSelectChoice={(choiceId) =>
                    handleObjectiveSelect(q.sessionQuestionId, choiceId)
                  }
                />
              </div>
            ))}
        </div>
      </div>

      <OmrPanel
        open={omrOpen}
        onClose={() => setOmrOpen(false)}
        items={omrItems}
        answeredIds={answeredIds}
        onJump={jumpTo}
        onSelectChoice={handleObjectiveSelect}
      />

      <SolveBottomBar
        startedAt={session.startedAt}
        answeredCount={answeredIds.size}
        totalCount={session.questions.length}
        drawingEnabled={drawingEnabled}
        onToggleDrawing={() => setDrawingEnabled((v) => !v)}
        calculatorOpen={calculatorOpen}
        onToggleCalculator={() => setCalculatorOpen((v) => !v)}
        omrOpen={omrOpen}
        onToggleOmr={() => setOmrOpen((v) => !v)}
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
