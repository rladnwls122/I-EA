"use client";
import { useState } from "react";
import * as math from "mathjs";
import { X } from "lucide-react";

const BUTTONS = [
  "sin(", "cos(", "tan(", "(",
  "log(", "ln(", "sqrt(", ")",
  "7", "8", "9", "÷",
  "4", "5", "6", "×",
  "1", "2", "3", "−",
  "0", ".", "π", "+",
  "^", "e", "C", "=",
];

function toMathExpr(display: string): string {
  return display
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("π", "pi");
}

export function Calculator({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragging = useState({ active: false, offX: 0, offY: 0 })[0];
  const [display, setDisplay] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    dragging.active = true;
    dragging.offX = e.clientX - pos.x;
    dragging.offY = e.clientY - pos.y;
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    if (!dragging.active) return;
    setPos({ x: e.clientX - dragging.offX, y: e.clientY - dragging.offY });
  };
  const onHeaderPointerUp = () => {
    dragging.active = false;
  };

  const press = (token: string) => {
    if (token === "C") {
      setDisplay("");
      setResult(null);
      return;
    }
    if (token === "=") {
      try {
        const value = math.evaluate(toMathExpr(display));
        setResult(String(value));
      } catch {
        setResult("오류");
      }
      return;
    }
    setDisplay((d) => d + token);
  };

  return (
    <div
      className="fixed z-[70] w-[260px] rounded-xl border border-border bg-card shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        className="flex cursor-grab items-center justify-between rounded-t-xl border-b border-border bg-surface-raised px-3 py-2 active:cursor-grabbing"
      >
        <span className="text-xs font-semibold text-foreground">계산기</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="min-h-[20px] text-right font-mono text-xs text-muted-foreground">
          {display || "0"}
        </div>
        <div className="min-h-[28px] text-right font-mono text-lg font-semibold text-foreground">
          {result ?? ""}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 p-3 pt-0">
        {BUTTONS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => press(b)}
            className={`rounded-md border border-border py-2 font-mono text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 ${
              b === "=" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-foreground"
            }`}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}
