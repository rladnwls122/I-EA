"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMyNotes, useSubjects } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import type { ReasonStat } from "@/lib/types";

import { REASON_COLORS, FALLBACK_COLORS, reasonColor } from "./reason-colors";

/** 도넛 차트 — 원인별 세그먼트 + 중앙 최다 원인. SVG stroke-dasharray로 그린다. */
function ReasonDonut({ stats }: { stats: ReasonStat[] }) {
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  // 마운트 후 dashoffset 트랜지션으로 세그먼트가 그려지는 1회 연출.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);

  if (total === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          아직 원인 태그가 없어요. 오답에 원인을 남기면 여기에 분포가 나타나요.
        </p>
      </div>
    );
  }

  const R = 70;
  const C = 2 * Math.PI * R;
  const GAP = stats.length > 1 ? 3 : 0; // 세그먼트 사이 숨 쉴 틈
  let offset = 0;
  const top = stats.reduce((a, b) => (b.count > a.count ? b : a), stats[0]);
  const topRatio = Math.round((top.count / total) * 100);

  return (
    <div className="relative mx-auto h-[180px] w-[180px]">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        {stats.map((s, i) => {
          const len = Math.max(0, (s.count / total) * C - GAP);
          const seg = (
            <circle
              key={s.code}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={reasonColor(s.code, i)}
              strokeWidth="16"
              strokeLinecap={stats.length > 1 ? "round" : "butt"}
              strokeDasharray={`${drawn ? len : 0} ${C}`}
              strokeDashoffset={-offset}
              className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
            />
          );
          offset += (s.count / total) * C;
          return seg;
        })}
      </svg>
      {/* 중앙: 최다 원인 — 이 페이지의 한 줄 결론 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-muted-foreground">가장 많은 원인</span>
        <span className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
          {top.label}
        </span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{topRatio}%</span>
      </div>
    </div>
  );
}

export function NotesDashboard() {
  const { data: subjects } = useSubjects();
  const [search, setSearch] = useState("");

  // 사이드바 선택(초안)과 조회 버튼으로 확정된 필터를 분리 — 조회를 눌러야 데이터가 바뀐다.
  const [examType, setExamType] = useState("");
  const [examCategory, setExamCategory] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [applied, setApplied] = useState<{
    examType?: string;
    examCategory?: string;
    subjectId?: string;
  }>({});

  const { data, isLoading } = useMyNotes(applied);

  // 3단 캐스케이드 옵션 — 상위 선택에 따라 하위 목록이 좁혀진다.
  const examTypes = useMemo(
    () => Array.from(new Set((subjects ?? []).map((s) => s.examType))),
    [subjects],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          (subjects ?? [])
            .filter((s) => !examType || s.examType === examType)
            .map((s) => s.examCategory),
        ),
      ),
    [subjects, examType],
  );
  const subjectOptions = useMemo(
    () =>
      (subjects ?? []).filter(
        (s) =>
          (!examType || s.examType === examType) &&
          (!examCategory || s.examCategory === examCategory),
      ),
    [subjects, examType, examCategory],
  );

  const apply = () =>
    setApplied({
      examType: examType || undefined,
      examCategory: examCategory || undefined,
      subjectId: subjectId || undefined,
    });

  const reset = () => {
    setExamType("");
    setExamCategory("");
    setSubjectId("");
    setApplied({});
  };

  const byReason = data?.summary?.byReason ?? [];
  const reasonTotal = byReason.reduce((sum, s) => sum + s.count, 0);

  const filteredQuestions = useMemo(() => {
    const list = data?.wrongQuestions ?? [];
    if (!search) return list;
    return list.filter((q) => extractPlainText(q.stem).includes(search));
  }, [data, search]);

  const appliedLabel = [
    applied.examType,
    applied.examCategory,
    applied.subjectId
      ? subjects?.find((s) => s.id === applied.subjectId)?.name
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8 lg:p-10">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">틀린 이유를 다음 정답으로</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          범위를 골라 조회하면 오답 원인 분포와 문항을 함께 볼 수 있어요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* ═══ 본문 ═══ */}
        <div className="min-w-0 lg:order-1">
          {/* 원인 분석 — 도넛 + 원인별 랭킹 */}
          <section className="mb-6 rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">오답 원인 분포</h2>
              {appliedLabel && (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {appliedLabel}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="h-[180px] animate-pulse rounded-lg bg-surface-raised" />
            ) : (
              <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[200px_1fr]">
                <ReasonDonut stats={byReason} />
                {/* 원인별 랭킹 — 색점 + 라벨 + 비중 바 + 건수 */}
                <div className="space-y-3">
                  {byReason.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      오답 문항에 원인 태그(개념부족·실수·시간부족)를 남겨보세요.
                    </p>
                  ) : (
                    [...byReason]
                      .sort((a, b) => b.count - a.count)
                      .map((s, i) => {
                        const ratio = reasonTotal > 0 ? s.count / reasonTotal : 0;
                        return (
                          <div key={s.code} className="flex items-center gap-3">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: reasonColor(s.code, i) }}
                            />
                            <span className="w-16 shrink-0 text-sm text-foreground">{s.label}</span>
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-raised">
                              <div
                                className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                                style={{
                                  width: `${Math.round(ratio * 100)}%`,
                                  backgroundColor: reasonColor(s.code, i),
                                }}
                              />
                            </div>
                            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {s.count}건
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 검색 */}
          <div className="relative mb-4 w-full md:w-72">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="오답 문항 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10"
            />
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
                {search || appliedLabel
                  ? "해당 범위의 오답 문항이 없습니다. 범위를 넓혀 다시 조회해 보세요."
                  : "아직 기록된 오답이 없습니다. 문제를 풀면 여기에서 다시 볼 수 있어요."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((q, i) => (
                <Link
                  href={`/notes/${q.questionId}?sessionId=${q.sessionId}`}
                  key={`${q.questionId}-${q.sessionId}`}
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
                        {q.subjectName}
                      </Badge>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {q.questionType} · 난이도 {q.difficulty}
                      </span>
                      {q.annotations?.[0]?.reasonCode && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            color: reasonColor(q.annotations[0].reasonCode, 0),
                            backgroundColor: `${reasonColor(q.annotations[0].reasonCode, 0)}1a`,
                          }}
                        >
                          {byReason.find((r) => r.code === q.annotations[0].reasonCode)?.label ??
                            q.annotations[0].reasonCode}
                        </span>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {extractPlainText(q.stem)}
                    </h3>
                    {q.annotations?.[0]?.memoText && (
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
        </div>

        {/* ═══ 우측 사이드바: 범위 조회 ═══ */}
        <aside className="lg:order-2">
          <div className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground">범위 조회</h2>

            {/* 시험 */}
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">시험</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {examTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={examType === t}
                  onClick={() => {
                    setExamType(examType === t ? "" : t);
                    setExamCategory("");
                    setSubjectId("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-all active:scale-[0.98] motion-reduce:transition-none ${
                    examType === t
                      ? "border-transparent bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* 과목(대분류) */}
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">과목</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={examCategory === c}
                  onClick={() => {
                    setExamCategory(examCategory === c ? "" : c);
                    setSubjectId("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-all active:scale-[0.98] motion-reduce:transition-none ${
                    examCategory === c
                      ? "border-transparent bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* 세부과목 */}
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">세부과목</label>
            <div className="mb-5 flex flex-wrap gap-1.5">
              {subjectOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={subjectId === s.id}
                  onClick={() => setSubjectId(subjectId === s.id ? "" : s.id)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-all active:scale-[0.98] motion-reduce:transition-none ${
                    subjectId === s.id
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={apply} className="flex-1">
                조회
              </Button>
              <Button onClick={reset} variant="outline" size="icon" aria-label="필터 초기화">
                <RotateCcw size={15} strokeWidth={2} />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
