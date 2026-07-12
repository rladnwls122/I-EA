"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe, useSubjects, useWorkbooks } from "@/lib/hooks";
import { WorkbookPreviewSidebar } from "@/components/workbook/WorkbookPreviewSidebar";
import { WorkbookCard } from "@/components/workbook/WorkbookCard";
import { CartButton } from "@/components/cart/CartButton";
import type { Subject } from "@/lib/types";

const chip = (active: boolean) =>
  `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
    active
      ? "border-transparent bg-primary font-medium text-primary-foreground"
      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

/** 공개 문제집 탐색 — 소유자 무관하게 PUBLIC만. 내 문제집 관리는 /workbook/mine. */
export default function WorkbookPage() {
  const [keyword, setKeyword] = useState("");
  const [examType, setExamType] = useState("");
  const [category, setCategory] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: subjectsData } = useSubjects();
  const allSubjects: Subject[] = subjectsData || [];

  // 3단 분류: 시험(examType) → 대분류(examCategory) → 세부과목(subject, 단일 — 백엔드가 subjectId 하나만 받는다).
  const examTypes = useMemo(
    () => Array.from(new Set(allSubjects.map((s) => s.examType))),
    [allSubjects],
  );
  const categories = useMemo(
    () =>
      examType
        ? Array.from(new Set(allSubjects.filter((s) => s.examType === examType).map((s) => s.examCategory)))
        : [],
    [allSubjects, examType],
  );
  const leafSubjects = useMemo(
    () =>
      examType && category
        ? allSubjects.filter((s) => s.examType === examType && s.examCategory === category)
        : [],
    [allSubjects, examType, category],
  );

  const { data, isLoading } = useWorkbooks({
    search: keyword || undefined,
    examType: examType || undefined,
    examCategory: category || undefined,
    subjectId: subjectId || undefined,
  });
  const { data: me } = useMe();
  const workbooks = data?.items || [];

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Workbook library
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">공개 문제집 탐색</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            다른 사람이 공개한 문제집을 둘러보고, 원하는 문항만 담아 풀어보세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/workbook/mine">내 문제집</Link>
          </Button>
          <Button asChild>
            <Link href="/workbook/create">문제집 만들기</Link>
          </Button>
        </div>
      </div>

      <div className="relative mb-4">
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

      {/* 1단: 시험 선택 */}
      <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            setExamType("");
            setCategory("");
            setSubjectId("");
          }}
          className={chip(examType === "")}
        >
          전체
        </button>
        {examTypes.map((t) => (
          <button
            key={t}
            onClick={() => {
              setExamType(examType === t ? "" : t);
              setCategory("");
              setSubjectId("");
            }}
            className={chip(examType === t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 2단: 대분류 — 시험을 골라야 노출 */}
      {examType && categories.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(category === c ? "" : c);
                setSubjectId("");
              }}
              className={chip(category === c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* 3단: 세부과목 단일 선택 — 대분류를 골라야 노출. "전체"는 이 대분류 전체(특정 세부과목 지정 없음). */}
      {category && leafSubjects.length > 0 && (
        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSubjectId("")}
            aria-pressed={subjectId === ""}
            className={chip(subjectId === "")}
          >
            전체
          </button>
          {leafSubjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubjectId(subjectId === s.id ? "" : s.id)}
              aria-pressed={subjectId === s.id}
              className={chip(subjectId === s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

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
            조건에 맞는 공개 문제집이 없습니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((wb) => (
            <WorkbookCard
              key={wb.id}
              wb={wb}
              onClick={() => setSelectedId(wb.id)}
              canEdit={!!me && me.id === wb.ownerId}
            />
          ))}
        </div>
      )}
      <WorkbookPreviewSidebar workbookId={selectedId} onClose={() => setSelectedId(null)} />
      <CartButton />
    </main>
  );
}
