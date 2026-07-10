"use client";
import { useState } from "react";
import { Check, ChevronRight, FolderPlus, X } from "lucide-react";
import { choices, type Question } from "@/lib/mock-data";

export function QuestionPreview({ question, onClose }: { question: Question | null; onClose: () => void }) {
  const [saved, setSaved] = useState(false); const [newBook, setNewBook] = useState(false); const [title, setTitle] = useState("");
  if (!question) return null;
  const add = () => { if (newBook && !title.trim()) return; setSaved(true); };
  return <div className="preview-layer" onMouseDown={onClose}><aside className="preview-sheet" onMouseDown={(e) => e.stopPropagation()}>
    <div className="preview-head"><div><span className="eyebrow">문제 미리보기</span><h2>{question.title}</h2></div><button className="icon-button" aria-label="닫기" onClick={onClose}><X/></button></div>
    <div className="preview-scroll"><div className="question-meta"><span>{question.subject}</span><span>{question.type}</span><span>난이도 {question.difficulty}</span></div><p className="question-copy">{question.body}</p>
      {question.type === "객관식" ? <div className="choice-list">{choices.map((c, i) => <button className="choice" key={c}><b>{i + 1}</b><span>{c}</span></button>)}</div> : <div className="answer-box">답안을 입력하는 주관식 문항입니다.</div>}
      <div className="hint">문제를 풀기 전에는 정답과 해설이 공개되지 않습니다.</div>
    </div>
    <div className="save-box"><div className="save-choice"><button className={`save-tab ${!newBook ? "selected" : ""}`} onClick={() => setNewBook(false)}>기존 문제집에 담기</button><button className={`save-tab ${newBook ? "selected" : ""}`} onClick={() => setNewBook(true)}><FolderPlus size={15}/> 새 문제집 만들기</button></div>
      {newBook ? <input autoFocus className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="새 문제집 이름"/> : <select className="field" defaultValue=""><option value="" disabled>문제집을 선택하세요</option><option>2026 수능 국어 실전 문제집</option><option>문학 오답 다시보기</option></select>}
      <button className="button primary" onClick={add}>{saved ? <><Check size={17}/> 문제를 담았습니다</> : <>문제 담기 <ChevronRight size={17}/></>}</button>
    </div>
  </aside></div>;
}
