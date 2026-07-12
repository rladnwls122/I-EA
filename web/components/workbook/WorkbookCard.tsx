"use client";
import { Eye, GitFork, Users } from "lucide-react";
import type { Workbook } from "@/lib/types";

/** 문제집 탐색/내 문제집 그리드 공용 카드. */
export function WorkbookCard({ wb, onClick }: { wb: Workbook; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              wb.visibility === "PUBLIC"
                ? "bg-primary/10 text-primary"
                : "bg-surface-raised text-muted-foreground"
            }`}
          >
            {wb.visibility === "PUBLIC" ? "공개" : "비공개"}
          </span>
          <span className="text-xs text-muted-foreground">문항 {wb.questionCount}개</span>
        </div>
        <h3 className="mb-1 text-base font-semibold">{wb.title}</h3>
        {wb.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{wb.description}</p>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Eye size={13} /> {wb.viewCount}
        </span>
        <span className="flex items-center gap-1">
          <GitFork size={13} /> {wb.forkCount}
        </span>
        <span className="flex items-center gap-1">
          <Users size={13} /> {wb.attemptCount}
        </span>
      </div>
    </button>
  );
}
