"use client";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { extractPlainText } from "@/lib/prosemirror";
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
    <article className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[11px] font-medium">
          {question.subject?.name ?? "과목 미지정"}
        </Badge>
        <span className="text-xs text-muted-foreground">{question.questionType}</span>
        <span className="text-xs text-muted-foreground">난이도 {question.difficulty}</span>
        <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          [{Number(question.points)}점]
        </span>
      </div>

      <p className="mb-5 whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
        {extractPlainText(question.stem)}
      </p>

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
                <span>{extractPlainText(c.content)}</span>
                {correct && <Check size={13} className="ml-auto text-correct" />}
              </div>
            );
          })}
        </div>
      )}

      {question.questionType === "주관식" && reveal && question.correctAnswerText && (
        <p className="rounded-lg bg-correct/10 border border-correct/30 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">정답: </span>
          <span className="font-medium text-foreground">{question.correctAnswerText}</span>
        </p>
      )}
    </article>
  );
}
