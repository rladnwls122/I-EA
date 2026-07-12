"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkbooks } from "@/lib/hooks";
import { WorkbookPreviewSidebar } from "@/components/workbook/WorkbookPreviewSidebar";
import { WorkbookCard } from "@/components/workbook/WorkbookCard";
import { CartButton } from "@/components/cart/CartButton";

/** 내 문제집 — 공개/비공개 무관하게 내가 만든 것만. 공개 문제집 탐색은 /workbook. */
export default function MyWorkbooksPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useWorkbooks({ search: keyword || undefined, mine: true });
  const workbooks = data?.items || [];

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            My workbooks
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">내 문제집</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            내가 만든 문제집을 모아봅니다(공개·비공개 모두).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/workbook">공개 탐색</Link>
          </Button>
          <Button asChild>
            <Link href="/workbook/create">문제집 만들기</Link>
          </Button>
        </div>
      </div>

      <div className="relative mb-8">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="내 문제집 제목으로 검색"
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
          <p className="mb-4 text-sm text-muted-foreground">
            아직 만든 문제집이 없습니다. 첫 문제집을 만들어보세요.
          </p>
          <Button asChild>
            <Link href="/workbook/create">문제집 만들기</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((wb) => (
            <WorkbookCard key={wb.id} wb={wb} onClick={() => setSelectedId(wb.id)} />
          ))}
        </div>
      )}
      <WorkbookPreviewSidebar workbookId={selectedId} onClose={() => setSelectedId(null)} />
      <CartButton />
    </main>
  );
}
