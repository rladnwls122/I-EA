"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookmarkCheck, BookOpenCheck, Lightbulb, User } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  // 인트로(비로그인 랜딩)는 몰입형 — 사이드바를 아예 그리지 않는다.
  // body의 pl-[64px]는 인트로 페이지가 -ml-[64px]로 상쇄한다(intro/page.tsx 참고).
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

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-50 flex w-[64px] flex-col items-center border-r border-border bg-sidebar py-5">
      <Link
        href="/"
        aria-label="홈"
        className="mb-8 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
      >
        IΔ
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
  );
}
