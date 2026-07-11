"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import dynamic from 'next/dynamic';

const VegaStatWidget = dynamic(
  () => import('@/components/notes/VegaStatWidget').then(mod => mod.VegaStatWidget),
  { ssr: false }
);

export default function NotesSidebarPage() {
  return (
    <>
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-[15px] mb-1">오답 원인 분석</h3>
        <p className="text-xs text-muted-foreground mb-4">최근 기록한 원인 태그 통계입니다.</p>
        <VegaStatWidget />
      </section>

      <section className="bg-card border border-border rounded-xl p-6 flex flex-col items-start">
        <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">Next step</span>
        <h3 className="text-[15px] font-semibold leading-snug mb-5">
          기록한 오답을 다시 풀어보세요.
        </h3>
        <Link
          href="/studio/editor"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm transition-colors hover:bg-primary/90"
        >
          복습 시작 <ArrowUpRight size={16} strokeWidth={2} />
        </Link>
      </section>
    </>
  );
}
