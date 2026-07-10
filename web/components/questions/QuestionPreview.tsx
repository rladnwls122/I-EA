"use client";
import { useState } from "react";
import { Check, ChevronRight, FolderPlus, X } from "lucide-react";
import type { Question } from "@/lib/types";
import { extractPlainText } from "@/lib/prosemirror";

export function QuestionPreview({ question, onClose }: { question: Question | null; onClose: () => void }) {
  const [saved, setSaved] = useState(false); 
  const [newBook, setNewBook] = useState(false); 
  const [title, setTitle] = useState("");

  if (!question) return null;

  const add = () => { 
    if (newBook && !title.trim()) return; 
    setSaved(true); 
  };

  const choices = question.choices?.content || [];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end" onMouseDown={onClose}>
      <aside 
        className="w-full max-w-[480px] bg-card h-full border-l-4 border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-300" 
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b-2 border-border flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">문제 미리보기</span>
            <h2 className="text-2xl font-black tracking-tight">{question.subject?.name || "과목 미지정"}</h2>
          </div>
          <button className="p-2 hover:bg-surface-raised rounded-xl transition-colors" aria-label="닫기" onClick={onClose}>
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="flex items-center gap-3 mb-8">
            <span className="bg-primary/10 text-primary border-2 border-primary/20 px-3 py-1 rounded-lg text-[12px] font-black uppercase">
              {question.questionType}
            </span>
            <span className="bg-surface-raised border-2 border-border px-3 py-1 rounded-lg text-[12px] font-black text-muted-foreground">
              난이도 {question.difficulty}
            </span>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none mb-10">
            <p className="text-lg font-bold leading-relaxed whitespace-pre-wrap text-foreground">
              {extractPlainText(question.stem)}
            </p>
          </div>

          {question.questionType === "객관식" ? (
            <div className="space-y-3 mb-10">
              {choices.map((c: any, i: number) => (
                <button 
                  className="w-full flex items-start gap-4 p-4 bg-surface-raised border-2 border-border rounded-xl text-left hover:border-primary transition-all group" 
                  key={i}
                >
                  <b className="w-6 h-6 rounded-full bg-border group-hover:bg-primary group-hover:text-black flex items-center justify-center text-[12px] font-black shrink-0 transition-colors">
                    {i + 1}
                  </b>
                  <span className="text-[15px] font-bold text-foreground/80 group-hover:text-foreground transition-colors">
                    {extractPlainText(c)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 bg-surface-raised border-2 border-dashed border-border rounded-2xl text-center mb-10">
              <p className="text-[14px] font-bold text-muted-foreground">답안을 입력하는 주관식 문항입니다.</p>
            </div>
          )}

          <div className="p-4 bg-purple/10 border-2 border-purple/20 rounded-xl flex items-start gap-3">
            <div className="p-1 bg-purple text-black rounded-md shrink-0">
              <Check size={14} strokeWidth={4} />
            </div>
            <p className="text-[13px] font-bold text-purple-700 dark:text-purple-300">
              문제를 풀기 전에는 정답과 해설이 공개되지 않습니다.
            </p>
          </div>
        </div>

        <div className="p-8 bg-surface-raised border-t-4 border-border space-y-4">
          <div className="flex bg-card border-2 border-border rounded-xl p-1">
            <button 
              className={`flex-1 py-2 text-[13px] font-black rounded-lg transition-all ${!newBook ? "bg-primary text-black shadow-sm" : "text-muted-foreground hover:text-foreground"}`} 
              onClick={() => setNewBook(false)}
            >
              기존 문제집
            </button>
            <button 
              className={`flex-1 py-2 text-[13px] font-black rounded-lg transition-all flex items-center justify-center gap-2 ${newBook ? "bg-primary text-black shadow-sm" : "text-muted-foreground hover:text-foreground"}`} 
              onClick={() => setNewBook(true)}
            >
              <FolderPlus size={14} strokeWidth={3} /> 새 문제집
            </button>
          </div>

          {newBook ? (
            <input 
              autoFocus 
              className="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary outline-none transition-all" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="새 문제집 이름"
            />
          ) : (
            <select className="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary outline-none transition-all appearance-none cursor-pointer">
              <option value="" disabled>문제집을 선택하세요</option>
              <option>2026 수능 국어 실전 문제집</option>
              <option>문학 오답 다시보기</option>
            </select>
          )}

          <button 
            className="w-full bg-foreground text-background py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-2 hover:-translate-y-1 hover:shadow-neo transition-all active:translate-y-0 active:shadow-none" 
            onClick={add}
          >
            {saved ? (
              <><Check size={20} strokeWidth={3} /> 문제를 담았습니다</>
            ) : (
              <>문제 담기 <ChevronRight size={20} strokeWidth={3} /></>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
