"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDebounce, useSubmitAnswer } from "@/lib/hooks";
import { RichContent } from "@/components/editor/RichContent";
import { sessionPassages } from "@/lib/session-passages";
import { stemBlankNumber } from "@/lib/blank-markers";
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

  const choices = item.snapshot.choices ?? [];

  // 지문 내장 빈칸(#43 gap 9 — 토익 Part 6): 이 문항이 지문의 몇 번 빈칸인지.
  // 지문에 같은 마커(___(n)___)가 그대로 보이므로, 배지는 "지문에서 이 번호를 찾아라"는 이정표다.
  // 빈칸형이 아니면 null이라 기존 문항의 화면은 하나도 바뀌지 않는다.
  const blankNumber = stemBlankNumber(item.snapshot.stem);

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-surface">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {order}.
        </span>
        <Badge variant="secondary" className="text-[10px] font-medium">
          {item.snapshot.questionType}
        </Badge>
        {blankNumber !== null && (
          <Badge variant="outline" className="text-[10px] font-medium tabular-nums">
            지문 빈칸 ({blankNumber})
          </Badge>
        )}
      </div>

      {/* 세트 지문은 전부 보여준다(#43). (가)(나)·토익 double은 나머지 지문 없이 풀 수 없다. */}
      {sessionPassages(item.snapshot).map((p, i) => (
        <div
          key={i}
          className="mb-4 rounded-lg bg-surface-raised px-3 py-2.5 text-sm leading-relaxed text-foreground"
        >
          {p.label && (
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{p.label}</p>
          )}
          <RichContent value={p.content} />
        </div>
      ))}

      <RichContent
        value={item.snapshot.stem}
        className="mb-4 text-sm leading-relaxed text-foreground"
      />

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
                <RichContent value={c.content} className="flex-1" />
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
        {submitAnswer.isPending && (
          <span className="text-[10px] text-muted-foreground">저장 중…</span>
        )}
      </div>

    </article>
  );
}
