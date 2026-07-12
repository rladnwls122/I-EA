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

  const chip = (it: (typeof items)[number]) => {
    const answered = answeredIds.has(it.sessionQuestionId);
    return (
      <button
        key={it.sessionQuestionId}
        type="button"
        onClick={() => onJump(it.sessionQuestionId)}
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-md border font-mono text-[11px] transition-colors ${
          answered
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40"
        }`}
      >
        {it.order}
      </button>
    );
  };

  return (
    <>
      {/* 모바일 — 가로 스크롤 답안 스트립(md 미만). 사이드 고정 대신 문항 아래 바로 붙는다. */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 md:hidden">
        <span className="flex-none font-mono text-[10px] tabular-nums text-muted-foreground">
          {answeredIds.size}/{items.length}
        </span>
        <div className="flex flex-1 gap-1.5 overflow-x-auto">{items.map(chip)}</div>
      </div>

      {/* 데스크톱 — 우측 고정 사이드 답안지(md 이상). */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="답안지 펼치기"
          className="sticky top-4 hidden h-9 w-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground md:flex"
        >
          <ChevronLeft size={16} />
        </button>
      ) : (
        <aside className="sticky top-4 hidden w-[200px] flex-none rounded-xl border border-border bg-card p-4 md:block">
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
          <div className="grid grid-cols-5 gap-1.5">{items.map(chip)}</div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            {answeredIds.size}/{items.length} 답변
          </p>
        </aside>
      )}
    </>
  );
}
