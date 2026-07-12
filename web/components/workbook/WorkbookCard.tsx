"use client";
import Link from "next/link";
import { ArrowUpRight, Eye, GitFork, Pencil, Trash2, Users } from "lucide-react";
import type { Workbook } from "@/lib/types";

/**
 * 문제집 탐색/내 문제집 그리드 공용 카드.
 * canEdit(소유자)이면 우상단에 수정 버튼을 띄운다 → /edit?workbookId=... 로 이동.
 * deleteMode(내 문제집 삭제 모드)이면 수정 버튼 대신 휴지통 표식을 띄우고 카드를 빨갛게 강조한다.
 * 이때 onClick은 미리보기가 아니라 삭제 확인(부모가 라우팅)으로 쓰인다.
 */
export function WorkbookCard({
  wb,
  onClick,
  canEdit = false,
  deleteMode = false,
}: {
  wb: Workbook;
  onClick: () => void;
  canEdit?: boolean;
  deleteMode?: boolean;
}) {
  return (
    <div className="relative">
      {deleteMode ? (
        <span
          className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-destructive/40 bg-card/90 px-2 py-1 text-xs font-medium text-destructive shadow-sm backdrop-blur"
          aria-hidden="true"
        >
          <Trash2 size={12} strokeWidth={2} /> 삭제
        </span>
      ) : (
        canEdit && (
          <Link
            href={`/edit?workbookId=${wb.id}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Pencil size={12} strokeWidth={2} /> 수정
          </Link>
        )
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={deleteMode ? `${wb.title} 삭제` : undefined}
        className={`group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border bg-card p-5 text-left shadow-surface transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none ${
          deleteMode
            ? "border-destructive/40 hover:border-destructive hover:bg-destructive/5 focus-visible:ring-destructive"
            : "border-border hover:border-primary/40 hover:bg-accent focus-visible:ring-ring"
        }`}
      >
        {/* 호버 시 우상단에 미리보기 화살표가 떠올라 클릭 가능함을 알린다(소유자는 수정 버튼이 그 자리). */}
        {!canEdit && !deleteMode && (
          <span className="pointer-events-none absolute right-4 top-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            미리보기 <ArrowUpRight size={13} strokeWidth={2.5} />
          </span>
        )}
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
          <span className="text-xs text-muted-foreground">
            문항 <span className="font-mono">{wb.questionCount}</span>개
          </span>
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
            <Eye size={13} /> <span className="font-mono">{wb.viewCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <GitFork size={13} /> <span className="font-mono">{wb.forkCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <Users size={13} /> <span className="font-mono">{wb.attemptCount}</span>
          </span>
        </div>
      </div>
      </button>
    </div>
  );
}
