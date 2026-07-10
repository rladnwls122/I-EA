"use client";
import Link from "next/link";
import { BookOpen, ClipboardList, FilePlus2, Grid2X2, Home, NotebookPen, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "홈", icon: Home }, { href: "/questions", label: "탐색", icon: Grid2X2 },
  { href: "/workbook/create", label: "문제집 만들기", icon: FilePlus2 }, { href: "/studio/editor", label: "문항 편집", icon: ClipboardList },
  { href: "/notes", label: "오답노트", icon: NotebookPen },
];
export function AppSidebar() { const path = usePathname(); return <aside className="sidebar"><Link aria-label="IΔEA 홈" href="/" className="side-logo">IΔ</Link>{links.map(({ href, label, icon: Icon }) => <Link key={href} title={label} href={href} className={`side-link ${path === href || (href !== "/" && path.startsWith(href)) ? "active" : ""}`}><Icon size={20}/></Link>)}<div className="side-bottom"><Link title="프로필" href="/login" className="side-link"><UserRound size={20}/></Link></div></aside>; }
export function AppFrame({ children, title = "문제 탐색" }: { children: React.ReactNode; title?: string }) { return <div className="app-shell"><AppSidebar/><header className="topbar"><div style={{fontWeight: 750, letterSpacing: "-.03em"}}>{title}</div><div className="subtle" style={{fontSize: 13}}>오늘도 한 문제씩, 나만의 학습 흐름</div></header>{children}</div>; }
