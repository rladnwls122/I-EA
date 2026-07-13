"use client";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateQuestion } from "@/lib/hooks";
import { buildRichDoc, buildRichBlocks, extractPlainText } from "@/lib/prosemirror";
import type { Question } from "@/lib/types";

/**
 * 문항 상세 인라인 수정 폼 — 소유자 전용.
 * 발문·선지·정답·해설·난이도를 평문으로 편집하고, 저장 시 ProseMirror JSON으로
 * 변환해 PATCH한다(백엔드 create 경로와 동일한 형상: choices=[{content,isCorrect}]).
 * 문제 유형 변경은 지원하지 않는다(선지↔주관식 전환은 재작성에 가깝다).
 */
export function QuestionEditForm({
  question,
  onDone,
}: {
  question: Question;
  onDone: () => void;
}) {
  const isObjective = question.questionType === "객관식";
  const initialChoices = (
    (question.choices as Array<{ content?: unknown; isCorrect?: boolean }> | undefined) ?? []
  ).map((c) => extractPlainText(c.content));

  const [stem, setStem] = useState(() => extractPlainText(question.stem));
  const [choices, setChoices] = useState<string[]>(
    initialChoices.length ? initialChoices : ["", "", "", ""],
  );
  const [correct, setCorrect] = useState(() => {
    const idx = (
      (question.choices as Array<{ isCorrect?: boolean }> | undefined) ?? []
    ).findIndex((c) => c.isCorrect === true);
    return idx >= 0 ? idx : 0;
  });
  const [answerText, setAnswerText] = useState(question.correctAnswerText ?? "");
  const [explanation, setExplanation] = useState(() =>
    question.explanation ? extractPlainText(question.explanation) : "",
  );
  const [difficulty, setDifficulty] = useState(question.difficulty);

  const update = useUpdateQuestion();

  const setChoice = (i: number, v: string) =>
    setChoices((prev) => prev.map((c, idx) => (idx === i ? v : c)));

  const save = () => {
    if (!stem.trim()) {
      toast.error("발문을 입력해주세요.");
      return;
    }
    if (isObjective && choices.filter((c) => c.trim()).length < 2) {
      toast.error("선지를 2개 이상 입력해주세요.");
      return;
    }
    update.mutate(
      {
        id: question.id,
        data: {
          stem: buildRichDoc(stem),
          difficulty,
          ...(isObjective
            ? {
                choices: choices.map((text, i) => ({
                  id: `c${i + 1}`,
                  content: buildRichDoc(text),
                  isCorrect: i === correct,
                })),
              }
            : {
                correctAnswerText: answerText.trim() || undefined,
              }),
          explanation: explanation.trim() ? buildRichBlocks(explanation) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("문항을 수정했어요.");
          onDone();
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "수정에 실패했어요."),
      },
    );
  };

  return (
    <article className="space-y-5 rounded-xl border border-primary/30 bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-primary">문항 수정</h2>
        <span className="text-xs text-muted-foreground">{question.questionType}</span>
      </div>

      {/* 발문 */}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">발문</span>
        <Textarea
          value={stem}
          onChange={(e) => setStem(e.target.value)}
          rows={3}
          className="resize-y text-sm"
        />
      </label>

      {/* 선지 (객관식) */}
      {isObjective && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground">
            선지 (정답을 선택하세요)
          </span>
          {choices.map((ch, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCorrect(i)}
                aria-label={`${i + 1}번을 정답으로`}
                aria-pressed={correct === i}
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-bold transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                  correct === i
                    ? "border-correct bg-correct text-white"
                    : "border-border text-muted-foreground hover:border-correct/40 hover:text-foreground"
                }`}
              >
                {correct === i ? <Check size={12} /> : i + 1}
              </button>
              <Input
                value={ch}
                onChange={(e) => setChoice(i, e.target.value)}
                placeholder={`${i + 1}번 선지`}
                className="h-9 flex-1"
              />
            </div>
          ))}
        </div>
      )}

      {/* 정답 (주관식) */}
      {!isObjective && (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            정답 (단답 자동채점용, 서술형은 비워두세요)
          </span>
          <Input
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            className="h-9"
          />
        </label>
      )}

      {/* 난이도 */}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">난이도</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDifficulty(n)}
              aria-pressed={difficulty === n}
              className={`h-8 w-8 rounded-md font-mono text-xs font-semibold tabular-nums transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                difficulty === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-raised text-muted-foreground hover:text-foreground"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </label>

      {/* 해설 */}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">해설</span>
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={3}
          className="resize-y text-sm"
        />
      </label>

      <div className="flex gap-2">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          저장
        </Button>
        <Button variant="outline" onClick={onDone} disabled={update.isPending}>
          취소
        </Button>
      </div>
    </article>
  );
}
