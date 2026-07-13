"use client";
import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { extractPlainText } from "@/lib/prosemirror";

/** 해설 접이식 패널 — reveal(채점결과)일 때만 부모가 렌더한다. */
export function ExplanationPanel({ explanation }: { explanation: any }) {
  const [open, setOpen] = useState(false);
  const text = extractPlainText(explanation);
  if (!text) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-150 ease-swift hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen size={14} />
        </span>
        <div className="flex-1">
          <span className="block text-sm font-semibold text-foreground">해설 · 풀이 보기</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t border-border px-5 py-4 text-sm leading-relaxed text-foreground/90">
          {text}
        </p>
      )}
    </div>
  );
}
