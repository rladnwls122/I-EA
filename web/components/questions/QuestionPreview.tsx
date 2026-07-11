"use client";
import { useState } from "react";
import { Check, ChevronRight, FolderPlus, Lock, X } from "lucide-react";
import type { Question } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractPlainText } from "@/lib/prosemirror";

export function QuestionPreview({
  question,
  onClose,
}: {
  question: Question | null;
  onClose: () => void;
}) {
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
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              문제 미리보기
            </span>
            <h2 className="text-xl font-semibold tracking-tight">
              {question.subject?.name || "과목 미지정"}
            </h2>
          </div>
          <button
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
              {question.questionType}
            </Badge>
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              난이도
              <span className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`h-1.5 w-1.5 rounded-full ${
                      n <= question.difficulty ? "bg-primary" : "bg-border"
                    }`}
                  />
                ))}
              </span>
            </span>
          </div>

          <p className="mb-8 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {extractPlainText(question.stem)}
          </p>

          {question.questionType === "객관식" ? (
            <div className="mb-8 space-y-2">
              {choices.map((c: any, i: number) => (
                <div
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3.5"
                  key={i}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-foreground/90">
                    {extractPlainText(c)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-8 rounded-lg border border-dashed border-border bg-surface-raised p-5 text-center">
              <p className="text-sm text-muted-foreground">
                답안을 직접 입력하는 주관식 문항입니다.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-raised p-3.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              문제를 풀기 전에는 정답과 해설이 공개되지 않습니다.
            </p>
          </div>
        </div>

        {/* 담기 */}
        <div className="space-y-3 border-t border-border p-6">
          <div className="flex gap-1 rounded-lg border border-border p-1">
            <button
              className={`flex-1 rounded-md py-2 text-[13px] font-medium transition-colors ${
                !newBook
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setNewBook(false)}
            >
              기존 문제집
            </button>
            <button
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-medium transition-colors ${
                newBook
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setNewBook(true)}
            >
              <FolderPlus size={14} /> 새 문제집
            </button>
          </div>

          {newBook ? (
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="새 문제집 이름"
              className="h-11"
            />
          ) : (
            <select className="h-11 w-full cursor-pointer appearance-none rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring">
              <option value="" disabled>
                문제집을 선택하세요
              </option>
              <option>2026 수능 국어 실전 문제집</option>
              <option>문학 오답 다시보기</option>
            </select>
          )}

          <Button
            onClick={add}
            size="lg"
            className="w-full"
            variant={saved ? "secondary" : "default"}
          >
            {saved ? (
              <>
                <Check size={18} /> 문제를 담았습니다
              </>
            ) : (
              <>
                문제 담기 <ChevronRight size={18} />
              </>
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
}
