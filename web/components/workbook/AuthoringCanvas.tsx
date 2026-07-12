"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { buildRichDoc, buildRichBlocks, extractPlainText } from "@/lib/prosemirror";
import { createQuestion, publishQuestion, addQuestionToWorkbook } from "@/lib/api";
import type { ParsedQuestion } from "@/lib/authoring-chat";
import { AuthoringChatPanel } from "./AuthoringChatPanel";

/** 좌측 캔버스 카드(경량 Draft — QuestionEditor의 Draft에서 편집에 쓰는 필드만). */
export interface CanvasCard {
  id: string;
  type: "객관식" | "주관식";
  stem: any;
  passage: any | null;
  choices: string[];
  correct: number;
  answerText: string;
  explanation: any;
}

/** ParsedQuestion(평문) → CanvasCard(ProseMirror 조립). */
function toCard(q: ParsedQuestion, id: string): CanvasCard {
  const isObjective = q.questionType === "객관식";
  return {
    id,
    type: q.questionType,
    stem: buildRichDoc(q.stem),
    passage: q.passage ? buildRichDoc(q.passage) : null,
    choices: isObjective ? q.choices ?? [] : [],
    correct: isObjective ? q.correctIndex ?? 0 : -1,
    answerText: q.answerText ?? "",
    explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
  };
}

export function AuthoringCanvas({ workbookId }: { workbookId: string }) {
  const [cards, setCards] = useState<CanvasCard[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // 채팅 제안 → 좌측 반영. target이 replace:N이면 그 자리 교체, 아니면 append.
  const applyQuestion = useCallback((q: ParsedQuestion) => {
    setCards((prev) => {
      const m = /^replace:(\d+)$/.exec(q.target ?? "new");
      const id = `local-${prev.length}-${q.stem.slice(0, 8)}`;
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < prev.length) {
          const copy = [...prev];
          copy[idx] = toCard(q, prev[idx].id);
          return copy;
        }
      }
      return [...prev, toCard(q, id)];
    });
  }, []);

  const handleSave = async () => {
    if (cards.length === 0) {
      toast.error("저장할 문항이 없습니다.");
      return;
    }
    if (!subjectId) {
      toast.error("과목 정보가 없습니다. 채팅에서 과목을 확인해주세요.");
      return;
    }
    setSaving(true);
    try {
      let failed = 0;
      for (const c of cards) {
        if (!extractPlainText(c.stem).trim()) continue;
        try {
          const created = await createQuestion({
            subjectId,
            questionType: c.type,
            stem: c.stem,
            choices:
              c.type === "객관식"
                ? c.choices.map((text, i) => ({
                    id: `c${i + 1}`,
                    content: buildRichDoc(text),
                    isCorrect: i === c.correct,
                  }))
                : undefined,
            correctAnswerText:
              c.type === "주관식" && c.answerText.trim() ? c.answerText.trim() : undefined,
            explanation: extractPlainText(c.explanation).trim()
              ? buildRichBlocks(extractPlainText(c.explanation))
              : undefined,
          } as any);
          await publishQuestion(created.id).catch(() => null);
          await addQuestionToWorkbook(workbookId, { questionId: created.id });
        } catch (e) {
          failed += 1;
          console.error("문항 저장 실패:", e);
        }
      }
      if (failed > 0) toast.error(`${failed}개 문항 저장에 실패했어요.`);
      else toast.success(`${cards.length}개 문항을 문제집에 저장했어요.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 좌: 캔버스 */}
      <section className="flex-1 flex flex-col min-w-0 border-r border-border">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Link href="/workbook/create" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} /> 뒤로가기
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            최종 검토
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cards.map((c, i) => (
            <article key={c.id} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <span className="font-mono">문제 {i + 1}</span>
                <span className="rounded bg-surface-raised px-1.5 py-0.5 text-muted-foreground">{c.type}</span>
              </div>
              <p className="text-sm text-foreground">{extractPlainText(c.stem)}</p>
              {c.type === "객관식" && (
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {c.choices.map((ch, j) => (
                    <li key={j} className={j === c.correct ? "text-primary" : ""}>
                      {j + 1}. {ch}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
          <button
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
            onClick={() =>
              applyQuestion({ target: "new", questionType: "객관식", stem: "", choices: ["", "", "", ""], correctIndex: 0 })
            }
          >
            <Plus size={16} /> 문항 추가
          </button>
        </div>
      </section>

      {/* 우: 채팅 (Task 7) */}
      <AuthoringChatPanel
        workbookId={workbookId}
        cards={cards}
        onSubjectResolved={setSubjectId}
        onApplyQuestion={applyQuestion}
      />
    </div>
  );
}
