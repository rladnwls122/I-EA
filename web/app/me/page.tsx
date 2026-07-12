"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, LogOut, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks";

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

  const logout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  if (!checked || isLoading) {
    return (
      <main className="mx-auto max-w-xl p-4 md:p-6">
        <div className="h-40 animate-pulse rounded-xl border border-border bg-surface-raised" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">내 정보</h1>

      <section className="rounded-xl border border-border bg-card p-4 md:p-6">
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
            <Flame size={18} className="shrink-0 text-primary" />
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

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut size={16} /> 로그아웃
      </Button>
    </main>
  );
}
