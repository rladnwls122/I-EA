"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookmarkCheck, BookOpenCheck, Lightbulb, User } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export function AppSidebar() {
  const pathname = usePathname();
  // 인트로(비로그인 랜딩)는 몰입형 — 사이드바를 아예 그리지 않는다.
  // body의 md:pl-[64px]는 인트로 페이지가 md:-ml-[64px]로 상쇄한다(intro/page.tsx 참고).
  if (pathname.startsWith("/intro")) return null;
  const nav = [
    { href: "/workbook", label: "문제집 탐색", icon: BookOpenCheck },
    { href: "/workbook/mine", label: "내 문제집", icon: BookmarkCheck },
    { href: "/notes", label: "오답노트", icon: Lightbulb },
  ];
  // 가장 구체적으로(길게) 일치하는 항목 하나만 활성 표시 — "/workbook"과
  // "/workbook/mine"처럼 접두사가 겹치는 라우트가 동시에 활성화되는 것을 막는다.
  const activeHref = nav
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const meActive = pathname === "/me" || pathname.startsWith("/me/");

  return (
    <>
      {/* 데스크톱 — 좌측 고정 레일(md 이상) */}
      <aside className="fixed left-0 top-0 bottom-0 z-50 hidden w-[64px] flex-col items-center border-r border-border bg-sidebar py-5 md:flex">
        <Link
          href="/"
          aria-label="홈"
          className="mb-8 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform active:scale-95"
        >
          <Logo className="h-6 w-6" />
        </Link>

        <nav className="flex flex-col gap-1.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors active:scale-95 motion-reduce:transition-none ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                }`}
              >
                <Icon size={21} strokeWidth={2} />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <Link
            href="/me"
            aria-label="내 정보"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground active:scale-95 motion-reduce:transition-none"
          >
            <User size={19} strokeWidth={2} />
          </Link>
        </div>
      </aside>

      {/* 모바일 — 하단 탭바(엄지 도달 영역, md 미만). 좌측 레일과 항목 구성 동일 + 라벨 노출. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="주요 메뉴"
      >
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors active:scale-95 motion-reduce:transition-none ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon size={20} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
        <Link
          href="/me"
          aria-current={meActive ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors active:scale-95 motion-reduce:transition-none ${
            meActive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <User size={20} strokeWidth={2} />
          내 정보
        </Link>
      </nav>
    </>
  );
}
