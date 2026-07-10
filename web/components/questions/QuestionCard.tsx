import type { Question } from "@/lib/types";
import { ChevronRight } from "lucide-react";
import { extractPlainText } from "@/lib/prosemirror";

export function QuestionCard({ question, onClick }: { question: Question; onClick: () => void }) { 
  return (
    <button 
      className="bg-card border-2 border-border rounded-2xl p-6 shadow-neo-sm hover:-translate-y-1 hover:border-primary hover:shadow-neo active:translate-y-1 active:shadow-none transition-all flex flex-col text-left w-full group" 
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4 w-full">
        <span className="inline-block bg-surface-raised border-2 border-border text-foreground px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase">
          {question.subject?.name || "과목 미지정"}
        </span>
        <span className={`text-[10px] font-black px-2 py-1 rounded-md border-2 ${
          question.difficulty >= 4 ? "bg-red-500/10 text-red-500 border-red-500/20" : 
          question.difficulty >= 2 ? "bg-primary/10 text-primary border-primary/20" : 
          "bg-green-500/10 text-green-500 border-green-500/20"
        }`}>
          난이도 {question.difficulty}
        </span>
      </div>
      <h3 className="text-lg font-bold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors mb-3">
        {question.searchText || extractPlainText(question.stem)}
      </h3>
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50 w-full">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black text-muted-foreground uppercase">{question.questionType}</span>
          <div className="flex gap-1">
            {question.tags?.slice(0, 2).map((tag) => (
              <span key={tag.id} className="text-[10px] font-bold text-primary">#{tag.name}</span>
            ))}
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </button>
  ); 
}
