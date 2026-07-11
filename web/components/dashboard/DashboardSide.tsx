"use client";
import Link from "next/link";
import { ChevronRight, Flame, Lock, Trophy } from "lucide-react";
import { useMilestones, useQuestions, useWorkbooks } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";

/** 마일스톤 진행률 — 달성/진행/잠금. */
export function MilestoneProgress({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useMilestones(enabled);
  const milestones = enabled ? data?.milestones || [] : [];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">마일스톤</h2>
        </div>
        {data?.summary && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {data.summary.achievedCount}/{data.summary.totalCount}
          </span>
        )}
      </div>

      {isLoading && enabled ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface-raised" />
      ) : milestones.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          학습을 시작하면 마일스톤이 열려요.
        </p>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => (
            <div key={m.key} className={m.locked ? "opacity-45" : ""}>
              <div className="mb-1 flex items-center gap-1.5">
                {m.locked && <Lock size={11} className="text-muted-foreground" />}
                <span
                  className={`text-xs ${
                    m.achieved ? "font-medium text-primary" : "text-foreground"
                  }`}
                >
                  {m.label}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {m.achieved ? "달성" : `${m.progress.current}/${m.progress.target}`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${m.achieved ? "bg-primary" : "bg-primary/40"}`}
                  style={{ width: `${Math.round(m.progress.ratio * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 인기 문제 top5 + 인기 문제집 top5 (조회수 기준) — 비로그인도 공개. */
export function PopularContent() {
  const { data: questions } = useQuestions({ sort: "popular", limit: 5 });
  const { data: workbooks } = useWorkbooks({ sort: "popular", limit: 5 });
  const topQuestions = (questions?.items || []).slice(0, 5);
  const topWorkbooks = (workbooks?.items || []).slice(0, 5);

  return (
    <section id="popular" className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Flame size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">인기 콘텐츠</h2>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          인기 문제
        </span>
        <Link
          href="/questions"
          className="flex items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          더 보기 <ChevronRight size={11} />
        </Link>
      </div>
      <div className="mb-5 space-y-1.5">
        {topQuestions.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">아직 문제가 없어요.</p>
        ) : (
          topQuestions.map((q) => (
            <Link
              key={q.id}
              href={`/questions/${q.id}`}
              className="block rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/40"
            >
              <p className="line-clamp-1 text-xs text-foreground">
                {extractPlainText(q.stem)}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {q.subject?.name ?? ""} · 조회 {q.viewCount}
              </p>
            </Link>
          ))
        )}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          인기 문제집
        </span>
        <Link
          href="/workbook"
          className="flex items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          더 보기 <ChevronRight size={11} />
        </Link>
      </div>
      <div className="space-y-1.5">
        {topWorkbooks.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">아직 문제집이 없어요.</p>
        ) : (
          topWorkbooks.map((wb) => (
            <Link
              key={wb.id}
              href="/workbook"
              className="block rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/40"
            >
              <p className="line-clamp-1 text-xs text-foreground">{wb.title}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                문항 {wb.questionCount} · 조회 {wb.viewCount}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
