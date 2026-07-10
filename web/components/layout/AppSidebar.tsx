"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, BrainCircuit, Lightbulb, User } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const nav = [
    { href: "/questions", icon: <BrainCircuit size={22} strokeWidth={2.5} /> },
    { href: "/workbook", icon: <BookOpenCheck size={22} strokeWidth={2.5} /> },
    { href: "/notes", icon: <Lightbulb size={22} strokeWidth={2.5} /> },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[64px] bg-background border-r-2 border-border flex flex-col items-center py-6 z-50">
      <Link 
        href="/" 
        className="w-10 h-10 bg-primary text-primary-foreground font-black text-lg flex items-center justify-center rounded-xl border-2 border-primary-foreground shadow-[0_3px_0_0_#ffffff] transition-transform active:translate-y-[2px] active:shadow-none mb-10"
      >
        IΔ
      </Link>
      
      <nav className="flex flex-col gap-6">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`w-12 h-12 flex items-center justify-center rounded-xl border-2 transition-all ${
                active 
                  ? "bg-primary text-primary-foreground border-primary-foreground shadow-[0_3px_0_0_#ffffff] -translate-y-[2px]" 
                  : "bg-surface-raised text-muted-foreground border-transparent hover:border-border hover:bg-card hover:-translate-y-1"
              } active:translate-y-[2px] active:shadow-none`}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <Link 
          href="/me"
          className="w-12 h-12 flex items-center justify-center rounded-full bg-card border-2 border-border text-foreground hover:bg-surface-raised hover:border-muted-foreground transition-all active:translate-y-1"
        >
          <User size={20} strokeWidth={2.5} />
        </Link>
      </div>
    </aside>
  );
}
