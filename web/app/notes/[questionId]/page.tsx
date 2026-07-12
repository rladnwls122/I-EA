"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, MessageCircle, Pencil, X, Loader2 } from "lucide-react";
import { useQuestion, useAnnotations } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";

export default function NoteDetailPage() {
  const { questionId } = useParams() as { questionId: string };
  const { data: question, isLoading } = useQuestion(questionId);
  const { data: annotations } = useAnnotations(questionId);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!question) {
    return (
      <div className="p-10">문항을 찾을 수 없습니다.</div>
    );
  }

  // 객관식 선지 파싱 시뮬레이션
  let choicesList: string[] = [];
  try {
    if (question.choices?.content && Array.isArray(question.choices.content)) {
      choicesList = question.choices.content.map((c: any) => extractPlainText(c));
    }
  } catch(e) {}

  return (
    // 모바일에서 좌우 여백을 줄이고, 가로 오버플로가 생기지 않도록 폭 계산 보정
    <main className="mx-auto w-full max-w-4xl overflow-x-hidden p-4 md:p-10">
      <Link
        href="/notes"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft size={14} /> 오답노트로 돌아가기
      </Link>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* 문항 본문 */}
        <section className="flex-1 min-w-0">
          <div className="mb-6">
            <span className="text-[11px] font-bold text-primary uppercase tracking-widest block mb-2">
              {question.subject?.name} · {question.questionType} · 난이도 {question.difficulty}
            </span>
            <h1 className="text-xl font-bold leading-relaxed whitespace-pre-wrap">
              {extractPlainText(question.stem)}
            </h1>
          </div>

          {/* 선지 렌더링 (객관식) */}
          {question.questionType === "객관식" && choicesList.length > 0 && (
            <div className="space-y-3 mb-10">
              {choicesList.map((choice, i) => {
                // 시뮬레이션: i===0이 정답, i===1이 고른 오답
                const isCorrect = i === 0;
                const isSelected = i === 1;
                
                return (
                  <div 
                    key={i} 
                    className={`flex items-center justify-between gap-3 flex-wrap p-4 rounded-xl border text-sm font-medium transition-colors ${
                      isCorrect
                        ? "bg-correct/10 border-correct/30 text-correct-foreground"
                        : isSelected
                          ? "bg-wrong/10 border-wrong/30 text-wrong-foreground"
                          : "bg-card border-border text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold flex-none ${
                        isCorrect ? "bg-correct text-white" : isSelected ? "bg-wrong text-white" : "bg-surface-raised text-muted-foreground"
                      }`}>
                        {isCorrect ? <Check size={12} /> : isSelected ? <X size={12} /> : i + 1}
                      </span>
                      <span className="break-words">{choice}</span>
                    </div>
                    {(isCorrect || isSelected) && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md flex-none ${
                        isCorrect ? "bg-correct/20 text-correct" : "bg-wrong/20 text-wrong"
                      }`}>
                        {isCorrect ? "정답" : "내가 고른 답"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 해설 */}
          <section className="bg-surface-raised border border-border/50 rounded-xl p-6 mt-10">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 block">
              해설
            </span>
            <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-p:text-foreground/80">
              <p className="whitespace-pre-wrap">{extractPlainText(question.explanation)}</p>
            </div>
          </section>
        </section>

        {/* 사이드 정보 (노트 특정 기능) — 모바일에선 본문 아래로 전체 폭 스택 */}
        <aside className="flex w-full flex-col gap-5 md:w-[280px]">
          <section className="bg-card border border-border rounded-xl p-5">
            <span className="text-xs font-medium text-muted-foreground block mb-3">이번 풀이 결과</span>
            <div className="flex items-center gap-2 text-wrong font-semibold text-lg">
              <X size={20} strokeWidth={2} /> 오답
            </div>
          </section>

          {annotations && annotations.length > 0 && (
            <section className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">내 메모</h3>
                <Pencil size={14} className="text-muted-foreground" />
              </div>
              {annotations.map(ann => (
                <div key={ann.id} className="mb-3 last:mb-0">
                  <p className="text-xs font-medium text-foreground/90 italic bg-primary/5 p-3 rounded-lg border border-primary/10">
                    "{ann.memoText}"
                  </p>
                  {ann.reasonCode && (
                    <span className="inline-block mt-2 text-[10px] font-bold px-2 py-1 rounded-md bg-surface-raised text-muted-foreground">
                      {ann.reasonCode}
                    </span>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">질문과 답변</h3>
              <MessageCircle size={14} className="text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              헷갈리는 부분을 남기면 함께 확인할 수 있어요.
            </p>
            <textarea 
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none resize-none min-h-[80px] focus:border-primary focus:ring-1 focus:ring-primary/20" 
              placeholder="질문을 남겨보세요"
            />
          </section>
        </aside>
      </div>
    </main>
  );
}
