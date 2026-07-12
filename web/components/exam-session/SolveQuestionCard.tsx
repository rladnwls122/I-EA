"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Lightbulb, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDebounce, useSubmitAnswer, useRevealHint } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import type { SessionQuestionItem } from "@/lib/types";

export function SolveQuestionCard({
  item,
  order,
  onAnswerStateChange,
  selectedId,
  onSelectChoice,
}: {
  item: SessionQuestionItem;
  order: number;
  onAnswerStateChange: (sessionQuestionId: string, answered: boolean) => void;
  // 객관식 선택은 상위(SessionPage)가 소유 — 답안지 OMR 마킹과 양방향 동기화된다.
  selectedId: string | null;
  onSelectChoice: (choiceId: string) => void;
}) {
  const isObjective = item.snapshot.questionType === "객관식";
  const submitAnswer = useSubmitAnswer(item.sessionQuestionId);
  const revealHint = useRevealHint();

  // ── 객관식: 단일 선택(라디오). 마스킹된 snapshot은 복수정답 여부를 알 수 없다(Global Constraints 참고) ──
  const selectChoice = (choiceId: string) => {
    onSelectChoice(choiceId); // 상위 공유 상태 + answeredIds 갱신
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
  // 한 번 받은 힌트는 hintText에 남겨 재클릭 시 재호출하지 않는다(문항당 1회, 비용 절약).
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const openHint = () => {
    if (hintText) return; // 이미 받은 힌트 있으면 재호출 안 함
    setHintError(null);
    revealHint.mutate(item.sessionQuestionId, {
      onSuccess: (res) => setHintText(res.hint),
      onError: (e: unknown) =>
        setHintError(e instanceof Error ? e.message : "힌트를 불러오지 못했어요. 다시 시도해 주세요."),
    });
  };

  const choices = item.snapshot.choices ?? [];

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-surface">
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
          {/* 선지 = 큰 토글 버튼. 선택 상태는 색 + 보더 + 체크 아이콘 이중 채널, 피드백은 즉각(150ms). */}
          {choices.map((c, i) => {
            const selected = selectedId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => selectChoice(c.id)}
                aria-pressed={selected}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border font-mono text-[11px] transition-colors duration-150 ease-swift ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{extractPlainText(c.content)}</span>
                {selected && (
                  <Check size={16} className="flex-none text-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          rows={3}
          placeholder="답안을 입력하세요"
          className="min-h-[52px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={openHint}
          disabled={revealHint.isPending}
          className="-ml-2 flex h-10 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        >
          {revealHint.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Lightbulb size={13} />
          )}
          힌트
        </button>
        {submitAnswer.isPending && (
          <span className="text-[10px] text-muted-foreground">저장 중…</span>
        )}
      </div>

      {hintText && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Lightbulb size={13} className="mt-0.5 flex-none text-primary" aria-hidden="true" />
          <p>{hintText}</p>
        </div>
      )}
      {hintError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {hintError}
        </p>
      )}
    </article>
  );
}
