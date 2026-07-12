"use client";
import { useEffect, useRef, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDebounce, useSubmitAnswer, useRevealHint } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import type { SessionQuestionItem } from "@/lib/types";

export function SolveQuestionCard({
  item,
  order,
  onAnswerStateChange,
}: {
  item: SessionQuestionItem;
  order: number;
  onAnswerStateChange: (sessionQuestionId: string, answered: boolean) => void;
}) {
  const isObjective = item.snapshot.questionType === "객관식";
  const submitAnswer = useSubmitAnswer(item.sessionQuestionId);
  const revealHint = useRevealHint();

  // ── 객관식: 단일 선택(라디오). 마스킹된 snapshot은 복수정답 여부를 알 수 없다(Global Constraints 참고) ──
  const [selectedId, setSelectedId] = useState<string | null>(
    item.answer?.selectedChoiceIds?.[0] ?? null,
  );

  const selectChoice = (choiceId: string) => {
    setSelectedId(choiceId);
    onAnswerStateChange(item.sessionQuestionId, true);
    submitAnswer.mutate({ selectedChoiceIds: [choiceId] });
  };

  // ── 주관식: 입력 후 600ms 디바운스 저장 ──
  const [answerText, setAnswerText] = useState(item.answer?.answerText ?? "");
  const debouncedText = useDebounce(answerText, 600);
  const firstRender = useRef(true);
  useEffect(() => {
    if (isObjective) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onAnswerStateChange(item.sessionQuestionId, debouncedText.trim().length > 0);
    submitAnswer.mutate({ answerText: debouncedText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  // ── 힌트 ──
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintUnavailable, setHintUnavailable] = useState(false);
  const openHint = () => {
    revealHint.mutate(item.sessionQuestionId, {
      onSuccess: (res) => setHintText(res.hint),
      onError: () => setHintUnavailable(true),
    });
  };

  const choices = item.snapshot.choices ?? [];

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {order}.
        </span>
        <Badge variant="secondary" className="text-[10px] font-medium">
          {item.snapshot.questionType}
        </Badge>
      </div>

      {item.snapshot.passage && (
        <div className="mb-4 rounded-lg bg-surface-raised px-3 py-2.5 text-sm leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap">{extractPlainText(item.snapshot.passage)}</p>
        </div>
      )}

      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {extractPlainText(item.snapshot.stem)}
      </p>

      {isObjective ? (
        <div className="space-y-2">
          {choices.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectChoice(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                selectedId === c.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] font-mono ${
                  selectedId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {i + 1}
              </span>
              <span>{extractPlainText(c.content)}</span>
            </button>
          ))}
        </div>
      ) : (
        <textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          rows={3}
          placeholder="답안을 입력하세요"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        {!hintUnavailable && (
          <button
            type="button"
            onClick={openHint}
            disabled={revealHint.isPending}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          >
            {revealHint.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Lightbulb size={13} />
            )}
            힌트
          </button>
        )}
        {submitAnswer.isPending && (
          <span className="text-[10px] text-muted-foreground">저장 중…</span>
        )}
      </div>

      {hintText && (
        <p className="mt-2 rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          💡 {hintText}
        </p>
      )}
    </article>
  );
}
