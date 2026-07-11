"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, BrainCircuit, Lightbulb, User } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  // 인트로(비로그인 랜딩)는 몰입형 — 사이드바를 아예 그리지 않는다.
  // body의 pl-[64px]는 인트로 페이지가 -ml-[64px]로 상쇄한다(intro/page.tsx 참고).
  if (pathname.startsWith("/intro")) return null;
  const nav = [
    { href: "/questions", label: "문제 탐색", icon: BrainCircuit },
    { href: "/workbook", label: "문제집", icon: BookOpenCheck },
    { href: "/notes", label: "오답노트", icon: Lightbulb },
  ];

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
          const active = pathname.startsWith(href);
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
