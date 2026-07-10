"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
// AppFrame은 더 이상 사용되지 않으므로 제거합니다.
import { QuestionCard } from "@/components/questions/QuestionCard";
import { QuestionPreview } from "@/components/questions/QuestionPreview";
import { useQuestions } from "@/lib/hooks";
import type { Question } from "@/lib/types";

export default function QuestionsPage() {
  const [keyword, setKeyword] = useState(""); 
  const [subject, setSubject] = useState("전체"); 
  const [selected, setSelected] = useState<Question | null>(null);

  const { data, isLoading } = useQuestions({
    search: keyword,
    // subjectId 필터링은 API 연동 시 실제 subjectId를 넘겨야 하지만, 
    // 현재 UI상 텍스트로 되어 있으므로 전체 목록을 가져와 클라이언트에서 필터링하거나 
    // API 명세에 맞춰 subjectId를 매핑해야 합니다.
  });

  const filtered = useMemo(() => {
    const list = data?.data || [];
    return list.filter((q) => 
      (subject === "전체" || q.subject?.name === subject)
    );
  }, [data, subject]);

  return (
    <>
      <main className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <span className="text-xs font-black tracking-widest uppercase text-muted-foreground mb-2 block">Question library</span>
            <h1 className="text-4xl font-black tracking-tight mb-2">필요한 문제를, 가장 빠르게</h1>
            <p className="text-muted-foreground font-bold">과목과 유형을 골라 나만의 문제집으로 바로 담아보세요.</p>
          </div>
          <Link className="bg-primary text-black px-6 py-3 rounded-xl font-black text-sm border-2 border-black shadow-[0_4px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all" href="/workbook/create">
            문제집 만들기
          </Link>
        </div>

        <section className="bg-card border-2 border-border rounded-2xl p-4 mb-6 flex items-center gap-4 shadow-neo-sm">
          <Search size={20} className="text-muted-foreground" />
          <input 
            className="flex-1 bg-transparent border-none outline-none font-bold text-foreground placeholder:text-muted-foreground/50"
            value={keyword} 
            onChange={(e) => setKeyword(e.target.value)} 
            placeholder="문제 제목, 개념, 키워드로 검색"
          />
          <button className="p-2 hover:bg-surface-raised rounded-lg transition-colors" aria-label="상세 필터">
            <SlidersHorizontal size={20} />
          </button>
        </section>

        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          <Filter size={16} className="text-muted-foreground mr-2" />
          {["전체", "문학", "언어와 매체", "미적분", "확률과 통계"].map((item) => (
            <button 
              key={item} 
              onClick={() => setSubject(item)} 
              className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-all whitespace-nowrap ${
                subject === item 
                  ? "bg-primary text-black border-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]" 
                  : "bg-surface-raised border-transparent text-muted-foreground hover:border-border"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-bold"><b>{filtered.length}</b>개의 문제</span>
          <button className="text-sm font-black text-muted-foreground hover:text-foreground">최신순</button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[200px] bg-surface-raised animate-pulse rounded-2xl border-2 border-border" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-card border-4 border-border rounded-3xl">
            <p className="text-lg font-bold text-muted-foreground">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((q) => (
              <QuestionCard key={q.id} question={q} onClick={() => setSelected(q)} />
            ))}
          </div>
        )}
      </main>
      <QuestionPreview question={selected} onClose={() => setSelected(null)} />
    </>
  );
}
