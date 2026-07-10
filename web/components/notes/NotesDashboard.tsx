"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock3, Lightbulb, Search, Target, Loader2 } from "lucide-react";
import { useMyNotes } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";

export function NotesDashboard() {
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useMyNotes();

  const subjects = ["전체", ...Object.keys(data?.summary?.bySubject || {})];
  
  const filteredQuestions = (data?.wrongQuestions || []).filter(q => {
    if (filter !== "전체" && q.subject?.name !== filter) return false;
    if (search && !q.searchText?.includes(search)) return false;
    return true;
  });

  return (
    <main className="p-8 lg:p-10 max-w-5xl mx-auto w-full selection:bg-primary selection:text-black">
      {/* ── 헤더 ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <span className="inline-block bg-surface-raised border-2 border-border text-foreground px-3 py-1 rounded-md text-[12px] font-black tracking-widest uppercase mb-4">
            Wrong answer notebook
          </span>
          <h1 className="text-5xl font-black tracking-tighter leading-tight">
            틀린 이유를<br />다음 정답으로.
          </h1>
          <p className="text-muted-foreground mt-4 text-[15px] font-bold">
            풀이 기록과 메모를 다시 꺼내 보며 약한 고리를 채워보세요.
          </p>
        </div>
        <div className="flex items-center justify-center w-32 h-32 rounded-3xl border-4 border-primary bg-card shadow-neo relative transform rotate-3 hover:rotate-0 hover:translate-y-1 hover:shadow-none transition-all">
          <div className="flex flex-col items-center">
            <b className="text-4xl font-black text-primary">68</b>
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wider mt-1">정답률 %</span>
          </div>
        </div>
      </div>

      {/* ── 요약 통계 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        <div className="bg-card border-2 border-border rounded-2xl p-6 flex flex-col shadow-neo-sm hover:-translate-y-1 hover:shadow-neo transition-all">
          <Target className="text-primary mb-4" size={32} strokeWidth={2.5} />
          <span className="text-[13px] font-black text-muted-foreground mb-1">이번 달 오답</span>
          <div className="mt-auto">
            <b className="text-3xl font-black">{data?.wrongQuestions?.length || 0}</b>
            <span className="text-[15px] font-bold text-muted-foreground ml-1">문제</span>
          </div>
        </div>
        <div className="bg-card border-2 border-border rounded-2xl p-6 flex flex-col shadow-neo-sm hover:-translate-y-1 hover:shadow-neo transition-all">
          <Clock3 className="text-purple mb-4" size={32} strokeWidth={2.5} />
          <span className="text-[13px] font-black text-muted-foreground mb-1">평균 풀이 시간</span>
          <div className="mt-auto">
            <b className="text-3xl font-black">1:42</b>
            <span className="text-[15px] font-bold text-muted-foreground ml-1">분</span>
          </div>
        </div>
        <div className="bg-primary text-black border-2 border-black rounded-2xl p-6 flex flex-col shadow-[0_4px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(255,255,255,0.2)] transition-all">
          <Lightbulb className="text-black mb-4" size={32} strokeWidth={2.5} />
          <span className="text-[13px] font-black opacity-80 mb-1">가장 많이 틀린 영역</span>
          <div className="mt-auto">
            <b className="text-2xl font-black tracking-tight">{Object.keys(data?.summary?.bySubject || {})[0] || "-"}</b>
          </div>
        </div>
      </div>

      {/* ── 필터 및 검색 ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div className="flex items-center bg-background border-2 border-border rounded-xl px-4 py-3 w-full md:w-72 focus-within:border-primary shadow-neo-sm transition-all">
          <Search size={20} strokeWidth={3} className="text-muted-foreground mr-3" />
          <input 
            placeholder="오답 문제 검색" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-0 outline-none text-[15px] font-bold w-full text-foreground placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {subjects.map(x => (
            <button 
              key={x} 
              onClick={() => setFilter(x)} 
              className={`px-4 py-2 rounded-xl text-[13px] font-black transition-all border-2 active:translate-y-[2px] active:shadow-none ${
                filter === x 
                  ? "bg-primary text-black border-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]" 
                  : "bg-surface-raised text-muted-foreground border-transparent hover:border-border hover:bg-card shadow-sm"
              }`}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      {/* ── 오답 리스트 ── */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin text-primary" size={40} strokeWidth={3} />
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="text-center py-24 bg-card border-4 border-border rounded-3xl shadow-neo-sm">
          <p className="text-lg font-bold text-muted-foreground">해당 조건의 오답 문항이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredQuestions.map((q, i) => (
            <Link 
              href={`/notes/${q.id}`} 
              key={q.id}
              className="flex items-start gap-5 p-6 bg-card border-2 border-border rounded-2xl transition-all shadow-neo-sm hover:border-primary hover:-translate-y-1 hover:shadow-neo active:translate-y-1 active:shadow-none group"
            >
              <div className="text-sm font-black text-muted-foreground group-hover:text-primary transition-colors w-8 pt-1">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-block bg-surface-raised border-2 border-border text-[10px] font-black text-foreground px-2 py-1 rounded-md mb-3 tracking-widest uppercase">
                  {q.subject?.name} · {q.questionType} · 난이도 {q.difficulty}
                </span>
                <h3 className="text-lg font-bold text-foreground leading-snug mb-4 line-clamp-2">
                  {extractPlainText(q.stem)}
                </h3>
                {q.annotations && q.annotations.length > 0 && (
                  <div className="bg-primary/10 rounded-xl p-4 border-2 border-primary/20">
                    <p className="text-[13px] font-bold text-primary italic line-clamp-1">
                      "{q.annotations[0].memoText}"
                    </p>
                  </div>
                )}
              </div>
              <ChevronRight size={24} strokeWidth={3} className="text-muted-foreground group-hover:text-primary transition-colors self-center flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
