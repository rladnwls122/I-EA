"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function OmrPanel({
  items,
  answeredIds,
  onJump,
}: {
  items: Array<{ sessionQuestionId: string; order: number }>;
  answeredIds: Set<string>;
  onJump: (sessionQuestionId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="답안지 펼치기"
        className="sticky top-4 flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft size={16} />
      </button>
    );
  }

  return (
    <aside className="sticky top-4 w-[200px] flex-none rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">답안지</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="답안지 접기"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {items.map((it) => {
          const answered = answeredIds.has(it.sessionQuestionId);
          return (
            <button
              key={it.sessionQuestionId}
              type="button"
              onClick={() => onJump(it.sessionQuestionId)}
              className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-[11px] transition-colors ${
                answered
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {it.order}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        {answeredIds.size}/{items.length} 답변
      </p>
    </aside>
  );
}
