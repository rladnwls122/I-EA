"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Lightbulb, ListChecks, Search, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useMyNotes } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";

/** Record<string, number>에서 값이 가장 큰 key. 비어 있으면 null. */
function topKey(rec: Record<string, number> | undefined): string | null {
  if (!rec) return null;
  let best: string | null = null;
  let bestVal = -Infinity;
  for (const [k, v] of Object.entries(rec)) {
    if (v > bestVal) {
      best = k;
      bestVal = v;
    }
  }
  return best;
}

export function NotesDashboard() {
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useMyNotes();

  const subjects = ["전체", ...Object.keys(data?.summary?.bySubject || {})];

  const filteredQuestions = useMemo(() => {
    return (data?.wrongQuestions || []).filter((q) => {
      if (filter !== "전체" && q.question.subject?.name !== filter) return false;
      if (search && !q.question.searchText?.includes(search)) return false;
      return true;
    });
  }, [data, filter, search]);

  // 실제 데이터 기반 지표 — API가 제공하는 필드만 사용한다.
  const totalWrong = data?.wrongQuestions?.length ?? 0;
  const topSubject = topKey(data?.summary?.bySubject);
  const topReason = topKey(data?.summary?.byReason);

  return (
    <main className="mx-auto w-full max-w-5xl p-8 lg:p-10">
      {/* 헤더 */}
      <div className="mb-9 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Wrong answer notebook
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            틀린 이유를 다음 정답으로
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            풀이 기록과 메모를 다시 꺼내 보며 약한 고리를 채워보세요.
          </p>
        </div>
      </div>

      {/* 요약 통계 — 실제 필드만 (총 오답 수 · 가장 많이 틀린 영역 · 가장 흔한 오답 원인) */}
      <div className="mb-9 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-border bg-card p-5">
          <Target size={18} className="mb-3 text-primary" strokeWidth={2} />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            총 오답 수
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {totalWrong}
            </span>
            <span className="text-sm text-muted-foreground">문제</span>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-card p-5">
          <ListChecks size={18} className="mb-3 text-primary" strokeWidth={2} />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            가장 많이 틀린 영역
          </span>
          <div className="mt-2">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {topSubject ?? "—"}
            </span>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-card p-5">
          <Lightbulb size={18} className="mb-3 text-primary" strokeWidth={2} />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            가장 흔한 오답 원인
          </span>
          <div className="mt-2">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {topReason ?? "—"}
            </span>
          </div>
        </div>
      </div>

      {/* 필터 및 검색 */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="relative w-full md:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="오답 문제 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {subjects.map((x) => (
            <button
              key={x}
              onClick={() => setFilter(x)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                filter === x
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      {/* 오답 리스트 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-xl border border-border bg-surface-raised"
            />
          ))}
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center">
          <p className="text-sm text-muted-foreground">
            {search || filter !== "전체"
              ? "해당 조건의 오답 문항이 없습니다. 다른 과목이나 키워드로 찾아보세요."
              : "아직 기록된 오답이 없습니다. 문제를 풀면 여기에서 다시 볼 수 있어요."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((q, i) => (
            <Link
              href={`/notes/${q.question.id}`}
              key={q.question.id}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all duration-150 hover:border-primary/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="w-8 shrink-0 pt-0.5 font-mono text-sm tabular-nums text-muted-foreground transition-colors group-hover:text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="font-mono text-[11px] font-medium text-muted-foreground"
                  >
                    {q.question.subject?.name || "과목 미지정"}
                  </Badge>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {q.question.questionType} · 난이도 {q.question.difficulty}
                  </span>
                </div>
                <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                  {extractPlainText(q.question.stem)}
                </h3>
                {q.annotations && q.annotations.length > 0 && q.annotations[0].memoText && (
                  <p className="mt-2.5 line-clamp-1 border-l border-primary/40 pl-2.5 text-[13px] italic text-muted-foreground">
                    {q.annotations[0].memoText}
                  </p>
                )}
              </div>
              <ChevronRight
                size={18}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
