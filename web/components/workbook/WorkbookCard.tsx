"use client";
import { ArrowUpRight, Eye, GitFork, Users } from "lucide-react";
import type { Workbook } from "@/lib/types";

/** 문제집 탐색/내 문제집 그리드 공용 카드. */
export function WorkbookCard({ wb, onClick }: { wb: Workbook; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:bg-surface-raised hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* 호버 시 우상단에 미리보기 화살표가 떠올라 클릭 가능함을 알린다. */}
      <span className="pointer-events-none absolute right-4 top-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        미리보기 <ArrowUpRight size={13} strokeWidth={2.5} />
      </span>
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
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        {/* 작성자 — 백엔드가 owner(id+nickname)를 include해 내려준다 */}
        {wb.owner ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              {wb.owner.nickname.trim().charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{wb.owner.nickname}</span>
          </span>
        ) : (
          <span />
        )}
        <div className="flex flex-none items-center gap-4">
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
      </div>
    </button>
  );
}
