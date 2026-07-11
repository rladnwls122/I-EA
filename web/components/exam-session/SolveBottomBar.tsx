"use client";
import { useEffect, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Calculator as CalculatorIcon, Pencil, Send } from "lucide-react";
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
  onRequestSubmit,
}: {
  startedAt: string | null;
  answeredCount: number;
  totalCount: number;
  drawingEnabled: boolean;
  onToggleDrawing: () => void;
  calculatorOpen: boolean;
  onToggleCalculator: () => void;
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
    <div className="sticky bottom-0 z-40 flex items-center gap-4 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        ⏱ {formatElapsed(elapsed)}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        답안 {answeredCount}/{totalCount}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {savingCount > 0 ? "저장 중…" : "💾 저장됨"}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleDrawing}
        aria-pressed={drawingEnabled}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          drawingEnabled
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
        title="화면필기"
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        onClick={onToggleCalculator}
        aria-pressed={calculatorOpen}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          calculatorOpen
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
        title="계산기"
      >
        <CalculatorIcon size={16} />
      </button>

      <Button size="sm" onClick={onRequestSubmit} className="gap-1.5">
        <Send size={14} /> 제출
      </Button>
    </div>
  );
}
