"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { QuestionPreview } from "@/components/questions/QuestionPreview";
import { CartButton } from "@/components/cart/CartButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuestions, useSubjects } from "@/lib/hooks";
import type { Question, Subject } from "@/lib/types";

const chip = (active: boolean) =>
  `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
    active
      ? "border-transparent bg-primary font-medium text-primary-foreground"
      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

export default function QuestionsPage() {
  const [keyword, setKeyword] = useState("");
  const [examType, setExamType] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Question | null>(null);

  const { data: subjectsData } = useSubjects();
  const allSubjects: Subject[] = subjectsData || [];
  const examTypes = useMemo(
    () => Array.from(new Set(allSubjects.map((s) => s.examType))),
    [allSubjects],
  );
  // 시험을 고르면 그 시험의 세부과목만, 안 고르면 전체 세부과목을 보여준다.
  const visibleSubjects = useMemo(
    () => (examType ? allSubjects.filter((s) => s.examType === examType) : allSubjects),
    [allSubjects, examType],
  );

  const { data, isLoading } = useQuestions({
    search: keyword || undefined,
    subjectIds: subjectIds.length ? subjectIds : undefined,
  });
  const filtered = data?.items || [];

  const toggleSubject = (id: string) => {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  return (
    <>
      <main className="mx-auto max-w-7xl p-8">
        {/* 헤더 */}
        <div className="mb-9 flex items-end justify-between gap-6">
          <div>
            <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Question library
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">
              필요한 문제를, 가장 빠르게
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              과목과 유형을 골라 나만의 문제집으로 바로 담아보세요.
            </p>
          </div>
          <Button asChild>
            <Link href="/workbook/create">문제집 만들기</Link>
          </Button>
        </div>

        {/* 검색 */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="문제 제목, 개념, 키워드로 검색"
            className="h-11 pl-10"
          />
        </div>

        {/* 시험 필터 */}
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setExamType("")}
            className={chip(examType === "")}
          >
            전체 시험
          </button>
          {examTypes.map((t) => (
            <button
              key={t}
              onClick={() => setExamType(examType === t ? "" : t)}
              className={chip(examType === t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* 세부과목 필터 — 다중 선택 */}
        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
          {visibleSubjects.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSubject(s.id)}
              aria-pressed={subjectIds.includes(s.id)}
              className={chip(subjectIds.includes(s.id))}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* 결과 카운트 */}
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            <span className="font-mono font-medium tabular-nums text-foreground">
              {filtered.length}
            </span>
            개의 문제
          </span>
        </div>

        {/* 그리드 */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[184px] animate-pulse rounded-xl border border-border bg-surface-raised"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-20 text-center">
            <p className="text-sm text-muted-foreground">
              검색 결과가 없습니다. 다른 키워드나 과목으로 찾아보세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onClick={() => setSelected(q)}
              />
            ))}
          </div>
        )}
      </main>
      <QuestionPreview question={selected} onClose={() => setSelected(null)} />
      <CartButton />
    </>
  );
}
