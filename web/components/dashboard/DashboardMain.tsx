"use client";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { useMyNotes, useMyExamSessions } from "@/lib/hooks";
import { REASON_COLORS } from "@/components/notes/reason-colors";

/** 오답노트 요약 — 원인별 컴팩트 바. 도넛은 /notes가 담당(중복 구현 안 함). */
export function WrongNotesSummary({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useMyNotes(undefined, enabled);
  const byReason = enabled ? data?.summary.byReason || [] : [];
  const wrongCount = enabled ? (data?.wrongQuestions || []).length : 0;
  const total = byReason.reduce((s, r) => s + r.count, 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">오답노트 요약</h2>
        <Link
          href="/notes"
          className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          전체 보기 <ChevronRight size={13} />
        </Link>
      </div>

      {isLoading && enabled ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-raised" />
      ) : byReason.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          아직 기록된 오답 원인이 없어요. 문제를 풀고 원인을 태그해보세요.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            미해결 오답 <span className="font-mono font-semibold text-wrong">{wrongCount}</span>개
          </p>
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
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">최근 풀이 기록</h2>
      </div>

      {isLoading && enabled ? (
        <div className="h-24 animate-pulse rounded-lg bg-surface-raised" />
      ) : recent.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          아직 제출한 풀이가 없어요. 문제집을 골라 시작해보세요.
        </p>
      ) : (
        <div className="space-y-2">
          {recent.map((s) => (
            <Link
              key={s.id}
              href={`/exam-sessions/${s.id}`}
              className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
