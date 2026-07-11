"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Users, Eye, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkbooks } from "@/lib/hooks";
import { WorkbookPreviewSidebar } from "@/components/workbook/WorkbookPreviewSidebar";

export default function WorkbookPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useWorkbooks({ search: keyword || undefined });
  const workbooks = data?.items || [];

  return (
    <main className="mx-auto max-w-7xl p-8">
      <div className="mb-9 flex items-end justify-between gap-6">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Workbook library
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            나만의 문제집, 모두의 문제집
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            공개된 문제집을 탐색하거나, 담아둔 문제로 새 문제집을 만들어보세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/workbook/create">문제집 만들기</Link>
        </Button>
      </div>

      <div className="relative mb-8">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="문제집 제목으로 검색"
          className="h-11 pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-[168px] animate-pulse rounded-xl border border-border bg-surface-raised"
            />
          ))}
        </div>
      ) : workbooks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center">
          <p className="text-sm text-muted-foreground">
            아직 문제집이 없습니다. 첫 문제집을 만들어보세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((wb) => (
            <button
              key={wb.id}
              type="button"
              onClick={() => setSelectedId(wb.id)}
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
                  <span className="text-xs text-muted-foreground">
                    문항 {wb.questionCount}개
                  </span>
                </div>
                <h3 className="mb-1 text-base font-semibold">{wb.title}</h3>
                {wb.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {wb.description}
                  </p>
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
          ))}
        </div>
      )}
      <WorkbookPreviewSidebar workbookId={selectedId} onClose={() => setSelectedId(null)} />
    </main>
  );
}
