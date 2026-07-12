"use client";
import Link from "next/link";
import { ChevronRight, Clock, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyNotes, useMyExamSessions } from "@/lib/hooks";
import { REASON_COLORS } from "@/components/notes/reason-colors";

/** 오답노트 요약 — 원인별 컴팩트 바. 도넛은 /notes가 담당(중복 구현 안 함). */
export function WrongNotesSummary({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useMyNotes(undefined, enabled);
  const byReason = enabled ? data?.summary.byReason || [] : [];
  const wrongCount = enabled ? (data?.wrongQuestions || []).length : 0;
  const total = byReason.reduce((s, r) => s + r.count, 0);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-surface md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">오답노트 요약</h2>
        <Link
          href="/notes"
          className="flex min-h-10 items-center gap-0.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors duration-150 ease-swift hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          전체 보기 <ChevronRight size={13} />
        </Link>
      </div>

      {isLoading && enabled ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-raised" />
      ) : byReason.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <NotebookPen size={18} />
          </span>
          <p className="text-center text-xs text-muted-foreground">
            아직 기록된 오답 원인이 없어요. 문제를 풀고 원인을 태그해보세요.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/questions">문제 풀러 가기</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-semibold text-wrong">{wrongCount}</span>
            <span className="text-xs text-muted-foreground">미해결 오답</span>
          </div>
          <div className="space-y-2">
            {byReason.map((r) => {
              const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
              const color = REASON_COLORS[r.code] ?? "#888e95";
              return (
                <div key={r.code} className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="w-16 flex-none text-xs text-foreground">{r.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
                    {r.count}건
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** 최근 풀이 기록 — 제출된 세션 최대 5개, 클릭 시 결과 페이지로. */
export function RecentSessions({ enabled }: { enabled: boolean }) {
  const { data: sessions, isLoading } = useMyExamSessions(enabled);
  const recent = (sessions || []).slice(0, 5);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-surface md:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">최근 풀이 기록</h2>
      </div>

      {isLoading && enabled ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-raised" />
      ) : recent.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock size={18} />
          </span>
          <p className="text-center text-xs text-muted-foreground">
            아직 제출한 풀이가 없어요. 문제집을 골라 시작해보세요.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/workbook">문제집 둘러보기</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((s) => (
            <Link
              key={s.id}
              href={`/exam-sessions/${s.id}`}
              className="flex min-h-[44px] items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors duration-150 ease-swift hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {s.workbookTitle ?? s.subjectName ?? "풀이 세션"}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : ""} · {s.correct}
                  /{s.total} 정답
                </p>
              </div>
              <span
                className={`font-mono text-sm font-semibold ${
                  s.scorePercent >= 80
                    ? "text-correct"
                    : s.scorePercent >= 50
                      ? "text-foreground"
                      : "text-wrong"
                }`}
              >
                {s.scorePercent}%
              </span>
              <ChevronRight size={14} className="flex-none text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
