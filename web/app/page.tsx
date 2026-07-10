"use client";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, BrainCircuit, ChartNoAxesCombined, CheckCircle2, Sparkles, Clock } from "lucide-react";
import { useRecentQuestions } from "@/lib/hooks";

export default function Home() {
  const { recent } = useRecentQuestions();

  return (
    <main className="min-h-screen pb-20 bg-background selection:bg-primary selection:text-black">
      {/* ── 내비게이션 ── */}
      <nav className="flex items-center justify-between px-8 py-5 border-b-2 border-border bg-background sticky top-0 z-50">
        <Link className="text-2xl font-black tracking-tighter text-foreground" href="/">
          I<span className="text-primary mx-0.5">Δ</span>EA
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/questions" className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">문제 탐색</Link>
          <Link href="/notes" className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">오답노트</Link>
          <Link href="/login" className="px-5 py-2.5 bg-foreground text-background text-sm font-extrabold rounded-xl hover:-translate-y-1 hover:shadow-neo transition-all active:translate-y-0 active:shadow-none">로그인</Link>
        </div>
      </nav>

      {/* ── 히어로 섹션 ── */}
      <section className="px-8 pt-20 pb-16 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
        <div className="flex-1">
          <span className="inline-block bg-surface-raised border-2 border-border text-foreground text-[12px] font-black tracking-widest px-3 py-1 rounded-md uppercase mb-6">
            AI-POWERED QUESTION BANK
          </span>
          <h1 className="text-6xl lg:text-[80px] font-black tracking-tighter leading-[1.05] text-foreground mb-6">
            공부의 흐름을<br />
            <em className="text-primary not-italic stroke-text">내 것으로.</em>
          </h1>
          <p className="text-lg font-bold text-muted-foreground leading-relaxed max-w-lg mb-10">
            문제를 고르고, 생각을 기록하고, 나만의 문제집으로 다시 만나는 가장 자연스러운 학습 경험.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-10">
            <Link 
              className="flex items-center gap-2 bg-primary text-black px-8 py-4 rounded-2xl font-black text-[15px] border-2 border-black shadow-[0_6px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:shadow-[0_8px_0_0_rgba(255,255,255,0.2)] active:translate-y-1 active:shadow-none transition-all" 
              href="/questions"
            >
              문제 탐색 시작하기 <ArrowRight size={20} strokeWidth={3} />
            </Link>
            <Link 
              className="flex items-center gap-2 bg-card border-2 border-border text-foreground px-8 py-4 rounded-2xl font-black text-[15px] shadow-neo-sm hover:-translate-y-1 hover:shadow-neo active:translate-y-[2px] active:shadow-none transition-all" 
              href="/workbook/create"
            >
              문제집 만들기
            </Link>
          </div>
          <div className="flex items-center gap-6 text-sm font-bold text-muted-foreground">
            <span className="flex items-center gap-2"><CheckCircle2 size={18} strokeWidth={3} className="text-correct" /> 개인화 문제 큐레이션</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={18} strokeWidth={3} className="text-correct" /> AI 출제 도우미</span>
          </div>
        </div>

        {/* 히어로 비주얼 (Mock UI) */}
        <div className="flex-1 relative w-full max-w-[500px] aspect-square">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[380px] bg-card border-4 border-border rounded-3xl p-7 shadow-neo z-10">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[13px] font-black text-muted-foreground">오늘의 학습</span>
              <b className="text-lg font-black text-primary">72%</b>
            </div>
            <div className="w-full h-3 bg-surface-raised rounded-full mb-8 border-2 border-border overflow-hidden">
              <div className="h-full bg-primary rounded-full w-[72%] border-r-2 border-border" />
            </div>
            <h3 className="text-xl font-black mb-1">문학 · 현대시</h3>
            <p className="text-[15px] font-bold text-foreground/80 mb-6">화자의 태도와 시적 상황</p>
            <div className="space-y-3">
              <div className="bg-primary border-2 border-black text-black px-4 py-3 rounded-xl text-sm font-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]">
                01 대상에 대한 그리움
              </div>
              <div className="bg-surface-raised border-2 border-border px-4 py-3 rounded-xl text-sm font-bold text-foreground/80 shadow-[0_3px_0_0_rgba(0,0,0,0.3)]">
                02 현실에 대한 비판
              </div>
            </div>
          </div>

          <div className="absolute top-10 right-0 lg:-right-6 bg-purple text-black border-2 border-black rounded-2xl p-4 shadow-[0_4px_0_0_rgba(255,255,255,0.2)] z-20 flex items-center gap-3 transform rotate-3">
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center text-purple">
              <Sparkles size={20} strokeWidth={2.5} />
            </div>
            <div>
              <span className="block text-[11px] font-black uppercase mb-0.5 opacity-80">AI 출제 중</span>
              <span className="block text-sm font-black">다음 문항을 준비하고 있어요</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 최근 본 문제 패널 ── */}
      <section className="px-8 py-20 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-primary text-black p-2 rounded-xl border-2 border-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]">
            <Clock size={24} strokeWidth={2.5} />
          </div>
          <h2 className="text-3xl font-black tracking-tight">최근 본 문제</h2>
        </div>
        
        {recent.length === 0 ? (
          <div className="bg-surface-raised border-4 border-border rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-neo-sm">
            <p className="text-lg font-bold text-muted-foreground mb-4">아직 최근에 학습한 문제가 없습니다.</p>
            <Link href="/questions" className="text-primary text-[15px] font-black hover:underline underline-offset-4">
              문제 탐색하러 가기 &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {recent.map((item) => (
              <Link 
                key={item.id} 
                href={`/questions/${item.id}`}
                className="group bg-card border-2 border-border rounded-2xl p-6 shadow-neo-sm hover:-translate-y-1 hover:border-primary hover:shadow-neo active:translate-y-1 active:shadow-none transition-all flex flex-col"
              >
                <span className="inline-block bg-surface-raised border-2 border-border text-foreground px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase mb-3 self-start">
                  {item.subject}
                </span>
                <h3 className="text-lg font-bold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors flex-1">
                  {item.title}
                </h3>
                <span className="text-xs font-bold text-muted-foreground mt-5 block">
                  {item.viewedAt ? new Date(item.viewedAt).toLocaleDateString() : '최근'} 확인
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 기능 소개 ── */}
      <section className="px-8 pb-20 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <article className="bg-primary text-black border-2 border-black rounded-3xl p-8 shadow-[0_6px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-transform">
          <BookOpenCheck className="mb-5" size={40} strokeWidth={2.5} />
          <h2 className="text-2xl font-black mb-3">골라 담는 문제</h2>
          <p className="text-[15px] font-bold opacity-80 leading-relaxed">
            과목, 개념, 난이도별로 필요한 문항을 빠르게 찾고 문제집으로 묶습니다.
          </p>
        </article>
        <article className="bg-purple text-black border-2 border-black rounded-3xl p-8 shadow-[0_6px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-transform">
          <BrainCircuit className="mb-5" size={40} strokeWidth={2.5} />
          <h2 className="text-2xl font-black mb-3">대화로 만드는 문항</h2>
          <p className="text-[15px] font-bold opacity-80 leading-relaxed">
            출제 의도를 말하면 AI가 초안을 제안하고, 에디터에서 완성합니다.
          </p>
        </article>
        <article className="bg-card text-foreground border-2 border-border rounded-3xl p-8 shadow-neo hover:-translate-y-1 transition-transform">
          <ChartNoAxesCombined className="text-correct mb-5" size={40} strokeWidth={2.5} />
          <h2 className="text-2xl font-black mb-3">쌓이는 오답의 이유</h2>
          <p className="text-[15px] font-bold text-muted-foreground leading-relaxed">
            틀린 이유와 메모를 남기면 다음 학습의 방향이 선명해집니다.
          </p>
        </article>
      </section>
    </main>
  );
}
