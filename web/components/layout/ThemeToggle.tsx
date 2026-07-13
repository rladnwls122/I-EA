"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * 라이트/다크 토글. next-themes(class 전략)로 html에 .dark를 붙였다 뗀다.
 * 서버 렌더 시엔 테마를 알 수 없어(FOUC 방지 스크립트가 클라이언트에서 클래스를 정함)
 * 마운트 전까진 아이콘을 비워 hydration 불일치를 피한다.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드" : "다크 모드"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`flex items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-foreground active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      {/* 마운트 전엔 자리만 차지(아이콘 미확정) — hydration mismatch 방지 */}
      {mounted ? (
        isDark ? <Sun size={19} strokeWidth={2} /> : <Moon size={19} strokeWidth={2} />
      ) : (
        <span className="h-[19px] w-[19px]" aria-hidden />
      )}
    </button>
  );
}
