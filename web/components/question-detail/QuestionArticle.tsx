"use client";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RichContent } from "@/components/editor/RichContent";
import type { Question } from "@/lib/types";

/**
 * 문항 본문 카드 — 메타(과목/유형/배점) + stem + 선지.
 * reveal=true(채점결과)일 때만 정답 선지를 초록으로 표시한다.
 * 주의: 이 가림은 표시상 처리다(네트워크엔 정답이 내려옴) — 스펙에 명시된 한계.
 */
export function QuestionArticle({
  question,
  reveal,
}: {
  question: Question;
  reveal: boolean;
}) {
  const choices: Array<{ id: string; content?: any; isCorrect?: boolean }> =
    Array.isArray(question.choices) ? question.choices : [];

  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-surface">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[11px] font-medium">
          {question.subject?.name ?? "과목 미지정"}
        </Badge>
        <span className="text-xs text-muted-foreground">{question.questionType}</span>
        <span className="text-xs text-muted-foreground">
          난이도 <span className="font-mono">{question.difficulty}</span>
        </span>
        <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-medium text-primary">
          [{Number(question.points)}점]
        </span>
      </div>

      {/* 세트 지문은 전부 보여준다(#43). 구형 응답 대비로 단수 passage도 받는다. */}
      {(question.passages?.length
        ? question.passages
        : question.passage
          ? [question.passage]
          : []
      ).map((p, i) => (
        <div
          key={p.id ?? i}
          className="mb-5 rounded-lg bg-surface-raised px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          {"label" in p && p.label && (
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{p.label}</p>
          )}
          <RichContent value={p.content} />
        </div>
      ))}

      <RichContent
        value={question.stem}
        className="mb-5 text-[15px] font-medium leading-relaxed text-foreground"
      />

      {question.questionType === "객관식" && choices.length > 0 && (
        <div className="space-y-2">
          {choices.map((c, i) => {
            const correct = reveal && c.isCorrect === true;
            return (
              <div
                key={c.id ?? i}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  correct
                    ? "border-correct bg-correct/10 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] font-mono ${
                    correct ? "border-correct text-correct" : "border-border"
                  }`}
                >
                  {i + 1}
                </span>
                <RichContent value={c.content} />
                {correct && <Check size={13} className="ml-auto text-correct" />}
              </div>
            );
          })}
        </div>
      )}

      {question.questionType === "주관식" && reveal && question.correctAnswerText && (
        <p className="flex items-center gap-2 rounded-lg border border-correct/30 bg-correct/10 px-3 py-2.5 text-sm">
          <Check size={14} className="flex-none text-correct" aria-hidden />
          <span className="text-muted-foreground">정답: </span>
          <span className="font-medium text-foreground">{question.correctAnswerText}</span>
        </p>
      )}
    </article>
  );
}
