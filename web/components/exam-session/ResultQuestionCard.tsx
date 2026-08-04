"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2, Sparkles, X } from "lucide-react";
import { ReviewTutorPanel } from "@/components/tutor/ReviewTutorPanel";
import { Badge } from "@/components/ui/badge";
import { useSelfGrade } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import { sessionPassages } from "@/lib/session-passages";
import type { SessionQuestionItem } from "@/lib/types";
import { ReviewDueLabel, ReviewStateBadge } from "@/components/notes/ReviewStateBadge";

export function ResultQuestionCard({
  item,
  order,
  onSelfGraded,
  isReview = false,
}: {
  item: SessionQuestionItem;
  order: number;
  onSelfGraded: (sessionQuestionId: string, isCorrect: boolean) => void;
  /** 복습 세션 결과면 상태 뱃지 노출(상태 변화가 복습의 보상) */
  isReview?: boolean;
}) {
  const selfGrade = useSelfGrade();
  const [tutorOpen, setTutorOpen] = useState(false);
  const isObjective = item.snapshot.questionType === "객관식";
  const choices = item.snapshot.choices ?? [];
  const selectedIds = new Set(item.answer?.selectedChoiceIds ?? []);
  const needsSelfGrade =
    !isObjective &&
    !item.snapshot.correctAnswerText &&
    item.answer != null &&
    (item.answer.isCorrect === null || item.answer.isCorrect === undefined);

  const isCorrect = item.answer?.isCorrect;
  const borderColor =
    isCorrect === true
      ? "border-correct"
      : isCorrect === false
        ? "border-wrong"
        : "border-border";

  const handleSelfGrade = (correct: boolean) => {
    selfGrade.mutate(
      { sessionQuestionId: item.sessionQuestionId, isCorrect: correct },
      { onSuccess: () => onSelfGraded(item.sessionQuestionId, correct) },
    );
  };

  // 문항 정답률(조립 시점 스냅샷 기준) — 표본이 10명 미만이면 노이즈라 숨긴다.
  const { totalSolvedCount, correctSolvedCount } = item.snapshot;
  const accuracyPercent =
    typeof totalSolvedCount === "number" &&
    typeof correctSolvedCount === "number" &&
    totalSolvedCount >= 10
      ? Math.round((correctSolvedCount / totalSolvedCount) * 100)
      : null;

  return (
    <article className={`rounded-xl border ${borderColor} bg-card p-5 shadow-surface`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {order}.
        </span>
        <Badge variant="secondary" className="text-[10px] font-medium">
          {item.snapshot.questionType}
        </Badge>
        {isReview && item.reviewState && (
          <>
            <ReviewStateBadge status={item.reviewState.status} />
            {/* 재풀이 결과로 언제 다시 나오는지(✗ 1일 · △ 3일)를 결과 화면에서 바로 보여준다. */}
            <ReviewDueLabel nextReviewAt={item.reviewState.nextReviewAt} />
          </>
        )}
        {isCorrect === true && (
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-correct">
            <Check size={13} /> 정답
          </span>
        )}
        {isCorrect === false && (
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-wrong">
            <X size={13} /> 오답
          </span>
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
          <p className="whitespace-pre-wrap">{extractPlainText(p.content)}</p>
        </div>
      ))}

      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {extractPlainText(item.snapshot.stem)}
      </p>

      {isObjective ? (
        <div className="space-y-2">
          {choices.map((c, i) => {
            const picked = selectedIds.has(c.id);
            const correct = c.isCorrect === true;
            return (
              <div
                key={c.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                  correct
                    ? "border-correct bg-correct/10 text-foreground"
                    : picked
                      ? "border-wrong bg-wrong/10 text-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-current text-[10px] font-mono">
                  {i + 1}
                </span>
                <span>{extractPlainText(c.content)}</span>
                {correct && <Check size={13} className="ml-auto text-correct" />}
                {!correct && picked && <X size={13} className="ml-auto text-wrong" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            내 답: <span className="text-foreground">{item.answer?.answerText || "(응답 없음)"}</span>
          </p>
          {item.snapshot.correctAnswerText && (
            <p className="text-muted-foreground">
              정답: <span className="text-foreground">{item.snapshot.correctAnswerText}</span>
            </p>
          )}
        </div>
      )}

      {needsSelfGrade && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">서술형 자기채점:</span>
          <button
            type="button"
            onClick={() => handleSelfGrade(true)}
            disabled={selfGrade.isPending}
            className="flex h-10 items-center gap-1 rounded-md border border-correct px-3 text-xs font-medium text-correct transition-colors duration-150 ease-swift hover:bg-correct/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            {selfGrade.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            맞음
          </button>
          <button
            type="button"
            onClick={() => handleSelfGrade(false)}
            disabled={selfGrade.isPending}
            className="flex h-10 items-center gap-1 rounded-md border border-wrong px-3 text-xs font-medium text-wrong transition-colors duration-150 ease-swift hover:bg-wrong/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            {selfGrade.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            틀림
          </button>
        </div>
      )}

      {extractPlainText(item.snapshot.explanation) && (
        <p className="mt-4 rounded-lg bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {extractPlainText(item.snapshot.explanation)}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
        <Link
          href={`/questions/${item.questionId}?reveal=1`}
          className="inline-flex h-10 items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors duration-150 ease-swift hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          문항 상세 보기 <ArrowUpRight size={12} />
        </Link>
        {/* 오답 복습 코치(#40) — 채점이 끝난 화면이라 정답을 설명해도 되는 단계다.
            서버가 "본인이 제출한 세션에서 푼 문항"인지 다시 검사한다. */}
        <button
          type="button"
          onClick={() => setTutorOpen(true)}
          className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-purple transition-colors hover:text-purple/80"
        >
          <Sparkles size={12} /> AI 코치
        </button>
        </div>
        {accuracyPercent !== null && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            (정답률: {accuracyPercent}%)
          </span>
        )}
      </div>

      {tutorOpen && (
        <ReviewTutorPanel questionId={item.questionId} onClose={() => setTutorOpen(false)} />
      )}
    </article>
  );
}
