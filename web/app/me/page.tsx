"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, LogOut, Mail, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ReviewStatsCard } from "@/components/me/ReviewStatsCard";
import { useMe, useSettings, useUpdateSettings } from "@/lib/hooks";
import { logoutAll } from "@/lib/api";

/** 내 정보 — 이메일/닉네임/레벨/XP/스트릭 + 로그아웃. */
export default function MePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  const { data: me, isLoading } = useMe(checked);
  const { data: settings } = useSettings(checked);
  const updateSettings = useUpdateSettings();

  // 서버에 토큰 무효화를 먼저 요청한 뒤 로컬을 정리한다.
  // localStorage만 지우면 그 토큰은 만료(7일)까지 계속 유효하다 — 공용 PC에서
  // "로그아웃했다"는 감각과 실제 상태가 어긋난다.
  // 서버 호출이 실패해도 로컬 정리는 반드시 진행한다(로그아웃을 막지 않는다).
  const logout = async () => {
    try {
      await logoutAll();
    } catch {
      // 네트워크/서버 오류. 로컬 로그아웃까지 막을 이유는 없다.
    }
    localStorage.removeItem("token");
    router.push("/login");
  };

  if (!checked || isLoading) {
    // 실제 레이아웃 모양 그대로 — 제목 / 프로필 카드 / 로그아웃 버튼 자리
    return (
      <main className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">내 정보</h1>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-surface md:p-6">
        <p className="truncate text-sm font-medium text-foreground">{me?.nickname}</p>
        <p className="truncate text-xs text-muted-foreground">{me?.email}</p>

        <div className="mt-5 flex flex-wrap items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="shrink-0 text-primary" />
            <div>
              <p className="font-mono text-lg font-semibold text-foreground">
                Lv.{me?.level}
              </p>
              <p className="text-xs text-muted-foreground">{me?.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Flame size={18} className="shrink-0 text-streak" />
            <div>
              <p className="font-mono text-lg font-semibold text-foreground">
                {me?.streak.current}일
              </p>
              <p className="text-xs text-muted-foreground">연속 학습</p>
            </div>
          </div>
          <div>
            <p className="font-mono text-lg font-semibold text-foreground">{me?.xp} XP</p>
            <p className="text-xs text-muted-foreground">누적 경험치</p>
          </div>
        </div>
      </section>

      {/* 출제 품질(AI 자기검증) — 판정된 문항이 있는 사용자에게만 보인다 */}
      <ReviewStatsCard enabled={checked} />

      {/* 이메일 알림 — 내 문제 댓글 / 내 댓글 답글. 네이티브 체크박스면 충분하다. */}
      <section className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-surface md:p-6">
        <div className="flex items-start gap-3">
          <Mail size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <label htmlFor="notify-comment-email" className="text-sm font-medium text-foreground">
              댓글 이메일 알림
            </label>
            <p className="text-xs text-muted-foreground">
              내 문제에 댓글이 달리거나 내 댓글에 답글이 달리면 {me?.email}로 보냅니다.
            </p>
          </div>
        </div>
        <input
          id="notify-comment-email"
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-primary"
          checked={settings?.notifyCommentEmail ?? false}
          disabled={!settings || updateSettings.isPending}
          onChange={(e) =>
            updateSettings.mutate(
              { notifyCommentEmail: e.target.checked },
              { onError: () => toast.error("알림 설정을 저장하지 못했습니다.") },
            )
          }
        />
      </section>

      {/* 화면 테마 — 모바일에선 좌측 레일 토글이 없으므로 여기서 전환 */}
      <section className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-surface md:p-6">
        <div>
          <p className="text-sm font-medium text-foreground">화면 테마</p>
          <p className="text-xs text-muted-foreground">라이트 / 다크 전환</p>
        </div>
        <ThemeToggle className="h-10 w-10 border border-border" />
      </section>

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut size={16} /> 로그아웃
      </Button>
    </main>
  );
}
