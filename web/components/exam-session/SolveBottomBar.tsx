"use client";
import { useEffect, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Calculator as CalculatorIcon, Check, ClipboardList, Pencil, Send, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SolveBottomBar({
  startedAt,
  answeredCount,
  totalCount,
  drawingEnabled,
  onToggleDrawing,
  calculatorOpen,
  onToggleCalculator,
  omrOpen,
  onToggleOmr,
  onRequestSubmit,
}: {
  startedAt: string | null;
  answeredCount: number;
  totalCount: number;
  drawingEnabled: boolean;
  onToggleDrawing: () => void;
  calculatorOpen: boolean;
  onToggleCalculator: () => void;
  omrOpen: boolean;
  onToggleOmr: () => void;
  onRequestSubmit: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // 이 세션에서 진행 중인 답안 저장(submit-answer) 뮤테이션이 하나라도 있으면 "저장 중"
  const savingCount = useIsMutating({ mutationKey: ["submit-answer"] });

  return (
    <div className="sticky bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      {/* 진행률 fill — 바 상단을 가로지르는 primary 라인 */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-secondary">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-swift"
          style={{ width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      <div className="flex items-center gap-4 px-4 py-3 md:px-6">
        <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
          <Timer size={13} aria-hidden="true" />
          {formatElapsed(elapsed)}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          답안 {answeredCount}/{totalCount}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {savingCount > 0 ? (
            "저장 중…"
          ) : (
            <>
              <Check size={12} className="text-primary" aria-hidden="true" />
              저장됨
            </>
          )}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onToggleOmr}
          aria-pressed={omrOpen}
          className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            omrOpen
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title="답안지"
        >
          <ClipboardList size={16} />
          <span className="hidden sm:inline">답안지</span>
        </button>
        <button
          type="button"
          onClick={onToggleDrawing}
          aria-pressed={drawingEnabled}
          className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            drawingEnabled
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title="화면필기"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleCalculator}
          aria-pressed={calculatorOpen}
          className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            calculatorOpen
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title="계산기"
        >
          <CalculatorIcon size={16} />
        </button>

        <Button onClick={onRequestSubmit} className="gap-1.5">
          <Send size={14} /> 제출
        </Button>
      </div>
    </div>
  );
}
