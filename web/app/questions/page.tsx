"use client";
import { useMemo, useState } from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { AppFrame } from "@/components/layout/AppSidebar";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { QuestionPreview } from "@/components/questions/QuestionPreview";
import { questions, type Question } from "@/lib/mock-data";

export default function QuestionsPage() {
  const [keyword, setKeyword] = useState(""); const [subject, setSubject] = useState("전체"); const [selected, setSelected] = useState<Question | null>(null);
  const filtered = useMemo(() => questions.filter((q) => (subject === "전체" || q.subject === subject) && `${q.title} ${q.body}`.includes(keyword)), [keyword, subject]);
  return <AppFrame title="문제 탐색"><main className="page-content"><div className="explore-heading"><div><span className="eyebrow">Question library</span><h1 className="title">필요한 문제를, 가장 빠르게</h1><p className="subtle">과목과 유형을 골라 나만의 문제집으로 바로 담아보세요.</p></div><a className="button primary" href="/workbook/create">문제집 만들기</a></div>
    <section className="search-panel panel"><Search size={19}/><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="문제 제목, 개념, 키워드로 검색"/><button aria-label="상세 필터"><SlidersHorizontal size={19}/></button></section>
    <div className="filter-row"><Filter size={15}/>{["전체", "문학", "언어와 매체", "미적분", "확률과 통계"].map((item) => <button key={item} onClick={() => setSubject(item)} className={`chip ${subject === item ? "selected" : ""}`}>{item}</button>)}</div>
    <div className="result-line"><span><b>{filtered.length}</b>개의 문제</span><button className="subtle">최신순</button></div><div className="question-grid">{filtered.map((q) => <QuestionCard key={q.id} question={q} onClick={() => setSelected(q)}/>)}</div>
  </main><QuestionPreview question={selected} onClose={() => setSelected(null)}/></AppFrame>;
}
