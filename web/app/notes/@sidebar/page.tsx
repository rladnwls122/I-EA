"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { VegaStatWidget } from "@/components/notes/VegaStatWidget";

export default function NotesSidebarPage() {
  return (
    <>
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-bold text-[15px] mb-1">오답 원인 분석</h3>
        <p className="text-xs text-muted-foreground mb-4">최근 기록한 원인 태그 통계입니다.</p>
        <VegaStatWidget />
      </section>

      <section className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col items-start relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        <span className="text-xs font-bold text-primary tracking-widest uppercase mb-2">Next Step</span>
        <h3 className="text-[17px] font-bold leading-snug mb-5 text-foreground/90">
          오늘 문학 오답<br />5문제를 다시 풀어보세요.
        </h3>
        <Link 
          href="/studio/editor" 
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm transition-colors duration-150 hover:bg-primary/90 z-10"
        >
          복습 시작 <ArrowUpRight size={16} />
        </Link>
      </section>
    </>
  );
}
