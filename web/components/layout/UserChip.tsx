"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/hooks";

/**
 * 우측 하단 고정 사용자 정보 칩.
 * 사이드바 하단에 있던 /me 진입점을 이곳으로 옮겼다.
 * 비로그인(토큰 없음)·인트로 페이지에서는 렌더하지 않는다.
 */
export function UserChip() {
  const pathname = usePathname();

  // localStorage 접근은 클라이언트에서만 — 하이드레이션 후 토큰 유무를 확정한다.
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasToken(!!localStorage.getItem("token"));
    }
  }, [pathname]);

  const isIntro = pathname.startsWith("/intro");
  const { data: me } = useMe(hasToken && !isIntro);

  if (isIntro || !hasToken || !me) return null;

  const initial = (me.nickname || me.email || "?").trim().charAt(0).toUpperCase();

  return (
    <Link
      href="/me"
      aria-label="내 정보"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full border border-border bg-card/90 py-1.5 pl-1.5 pr-3.5 shadow-lg backdrop-blur transition-colors hover:border-primary/40 active:scale-95 motion-reduce:transition-none"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {initial}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="max-w-[9rem] truncate text-sm font-medium text-foreground">
          {me.nickname}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          Lv.{me.level} · {me.title}
        </span>
      </span>
    </Link>
  );
}
