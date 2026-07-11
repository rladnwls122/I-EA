"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { QuestionPreview } from "@/components/questions/QuestionPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuestions } from "@/lib/hooks";
import type { Question } from "@/lib/types";

const SUBJECTS = ["전체", "문학", "언어와 매체", "미적분", "확률과 통계"];

export default function QuestionsPage() {
  const [keyword, setKeyword] = useState("");
  const [subject, setSubject] = useState("전체");
  const [selected, setSelected] = useState<Question | null>(null);

  const { data, isLoading } = useQuestions({ search: keyword });

  const filtered = useMemo(() => {
    const list = data?.items || [];
    return list.filter(
      (q) => subject === "전체" || q.subject?.name === subject,
    );
  }, [data, subject]);

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
            className="h-11 pl-10 pr-11"
          />
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            aria-label="상세 필터"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {/* 과목 필터 */}
        <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map((item) => (
            <button
              key={item}
              onClick={() => setSubject(item)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                subject === item
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {item}
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
          <button className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            최신순
          </button>
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
    </>
  );
}
