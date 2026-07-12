"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMilestones, useActiveSession } from "@/lib/hooks";
import { WrongNotesSummary, RecentSessions } from "./DashboardMain";
import { SpotlightSearch } from "./SpotlightSearch";
import { MilestoneProgress, PopularContent, WalletSummary } from "./DashboardSide";

/** 인사말 + 스트릭/레벨/XP 진행바 헤어로. */
function StreakHero({ enabled, onBrowse }: { enabled: boolean; onBrowse: () => void }) {
  const { data } = useMilestones(enabled);
  const s = data?.summary;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-surface md:p-6">
      {/* 모바일에서는 세로 스택, md 이상에서 기존 가로 배치 유지 */}
      <div className="flex flex-wrap items-center gap-4 md:gap-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-streak/10 text-streak">
            <Flame size={24} />
          </span>
          <div>
            <p className="font-mono text-2xl font-semibold text-streak">
              {s ? `${s.currentStreak}일` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">연속 학습</p>
          </div>
        </div>

        <div>
          <p className="font-mono text-2xl font-semibold text-foreground">
            {s ? `Lv.${s.level}` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{s?.title ?? "레벨"}</p>
        </div>

        <div className="w-full min-w-0 flex-1 md:w-auto md:min-w-[160px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">XP {s?.xp ?? 0}</span>
            {s?.xpToNextTier != null && (
              <span className="font-mono text-[10px] text-muted-foreground">
                다음 티어까지 {s.xpToNextTier}
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width:
                  s && s.xpToNextTier != null
                    ? `${Math.min(100, Math.round((s.xp / (s.xp + s.xpToNextTier)) * 100))}%`
                    : s
                      ? "100%"
                      : "0%",
              }}
            />
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <Button asChild size="sm">
            <Link href="/workbook/create">
              나만의 문제집 생성 <ArrowRight size={14} />
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onBrowse}>
            문제집 둘러보기
          </Button>
        </div>
      </div>
    </section>
  );
}

/** 풀다 만 세션 이어하기 배너 — IN_PROGRESS 있을 때만. */
function ResumeBanner({ enabled }: { enabled: boolean }) {
  const { data: active } = useActiveSession(enabled);
  if (!active) return null;

  return (
    <Link
      href={`/exam-sessions/${active.id}`}
      className="flex items-center gap-4 rounded-2xl border border-primary/40 bg-card p-4 shadow-surface transition-colors duration-150 ease-swift hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:p-5"
    >
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-key">
        <Play size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-foreground md:text-lg">
          풀던 시험 이어하기 — {active.workbookTitle ?? active.subjectName ?? "세션"}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {active.answered}/{active.total} 문항 진행 중
        </p>
      </div>
      <ArrowRight size={18} className="flex-none text-primary" />
    </Link>
  );
}

/**
 * 홈 대시보드 — 로그인 시 개인화(스트릭/오답/기록/마일스톤), 비로그인 시
 * 개인화 섹션 블러 + 로그인 유도 오버레이(인기 콘텐츠는 공개).
 */
export function Dashboard() {
  // localStorage 판정은 마운트 후에만(SSR/하이드레이션 불일치 방지) — 초기엔 스켈레톤.
  const [auth, setAuth] = useState<"pending" | "in" | "out">("pending");
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    setAuth(localStorage.getItem("token") ? "in" : "out");
  }, []);

  const loggedIn = auth === "in";

  if (auth === "pending") {
    return (
      <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
        <div className="h-28 animate-pulse rounded-2xl border bg-surface-raised" />
        <div className="h-64 animate-pulse rounded-2xl border bg-surface-raised" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      {/* 스포트라이트 검색 — 로그인 여부 무관 공개 */}
      <div className="mb-4">
        <SpotlightSearch open={searchOpen} onOpenChange={setSearchOpen} />
      </div>

      {/* 개인화 영역 — 비로그인이면 블러 게이트 */}
      <div className="relative">
        <div
          className={
            loggedIn ? "space-y-4" : "pointer-events-none select-none space-y-4 blur-sm"
          }
          aria-hidden={!loggedIn}
        >
          {/* "오늘 다음 할 일"(이어풀기)이 위계 최상단 — 있을 때만 렌더되므로 없으면 헤어로가 그대로 첫 요소 */}
          <ResumeBanner enabled={loggedIn} />
          <StreakHero enabled={loggedIn} onBrowse={() => setSearchOpen(true)} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <WrongNotesSummary enabled={loggedIn} />
              <RecentSessions enabled={loggedIn} />
            </div>
            <div className="space-y-4">
              <WalletSummary enabled={loggedIn} />
              <MilestoneProgress enabled={loggedIn} />
            </div>
          </div>
        </div>

        {!loggedIn && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles size={22} />
            </span>
            <p className="text-sm font-medium text-foreground">
              로그인하고 내 학습 기록을 확인하세요
            </p>
            <Button asChild size="sm">
              <Link href="/login">로그인하기</Link>
            </Button>
          </div>
        )}
      </div>

      {/* 인기 콘텐츠 — 비로그인도 공개 */}
      <div className="mt-4">
        <PopularContent />
      </div>
    </main>
  );
}
