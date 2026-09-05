"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CheckSquare, Loader2, NotebookPen, Sparkles, Square, X } from "lucide-react";
import { ReviewTutorPanel } from "@/components/tutor/ReviewTutorPanel";
import { Badge } from "@/components/ui/badge";
import { useSelfGrade } from "@/lib/hooks";
import { isRichEmpty } from "@/lib/prosemirror";
import { RichContent } from "@/components/editor/RichContent";
import { sessionPassages } from "@/lib/session-passages";
import {
  formatPoints,
  readRubricCriteria,
  readRubricGrading,
  sumRubricPoints,
} from "@/lib/rubric";
import type { SessionQuestionItem } from "@/lib/types";
import { ReviewDueLabel, ReviewStateBadge } from "@/components/notes/ReviewStateBadge";

export function ResultQuestionCard({
  item,
  order,
  onSelfGraded,
  isReview = false,
  sessionId,
}: {
  item: SessionQuestionItem;
  order: number;
  onSelfGraded: (sessionQuestionId: string, isCorrect: boolean) => void;
  /** 오답노트 링크에 실어 보낼 세션 — 그 세션의 스냅샷·내 답안 기준으로 문항을 보여준다. */
  sessionId: string;
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

  /* 채점기준표(#43 gap 8) — 있으면 "맞음/틀림" 두 버튼 대신 기준 체크리스트로 채점한다.
     서술형은 부분점수로 채점되므로 정오 두 갈래로는 실제 점수를 표현할 수 없다.
     형태가 깨진 값은 null이 되어 기존 두 버튼으로 되돌아간다(readRubricCriteria). */
  const rubric = readRubricCriteria(item.snapshot.rubric);
  // 이미 채점했다면 그때 체크한 기준과 점수. 새로고침해도 근거가 남아야 복기가 된다.
  const savedGrading = readRubricGrading(item.answer?.annotations);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const checkedSet = new Set(checkedIds);
  const earnedPreview = rubric ? sumRubricPoints(rubric, checkedSet) : 0;
  const totalPoints = rubric ? sumRubricPoints(rubric, rubric.map((c) => c.id)) : 0;

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

  /* 기준 체크 채점. 정오는 보내지 않는다 — 배점 합으로 서버가 정한다(근거는 하나여야 한다). */
  const handleRubricGrade = () => {
    selfGrade.mutate(
      { sessionQuestionId: item.sessionQuestionId, checkedCriterionIds: checkedIds },
      { onSuccess: (res) => onSelfGraded(item.sessionQuestionId, res.isCorrect) },
    );
  };

  const toggleCriterion = (id: string) =>
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
            {/* 재풀이 결과로 언제 다시 나오는지(✗ 1일 · △ 3→7일 누진)를 결과 화면에서 바로 보여준다. */}
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
          <RichContent value={p.content} />
        </div>
      ))}

      <RichContent
        value={item.snapshot.stem}
        className="mb-4 text-sm leading-relaxed text-foreground"
      />

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
                <RichContent value={c.content} />
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

      {/* 채점기준표가 있는 문항: 기준 체크리스트로 부분점수를 매긴다. */}
      {needsSelfGrade && rubric && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              서술형 자기채점 — 충족한 채점기준을 체크하세요
            </span>
            <span className="font-mono text-xs font-medium tabular-nums text-foreground">
              {formatPoints(earnedPreview)} / {formatPoints(totalPoints)}점
            </span>
          </div>
          <ul className="space-y-1.5">
            {rubric.map((c) => {
              const on = checkedSet.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggleCriterion(c.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      on
                        ? "border-correct bg-correct/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {on ? (
                      <CheckSquare size={15} className="flex-none text-correct" />
                    ) : (
                      <Square size={15} className="flex-none" />
                    )}
                    <span className="flex-1">{c.text}</span>
                    <span className="flex-none font-mono text-xs tabular-nums">
                      {formatPoints(c.points)}점
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={handleRubricGrade}
            disabled={selfGrade.isPending}
            className="mt-2.5 flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-150 ease-swift hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            {selfGrade.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            채점 확정
          </button>
          {/* 아무것도 체크하지 않은 채로 확정할 수도 있다 — 0점도 유효한 채점 결과다. */}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            체크한 기준의 배점 합이 이 문항의 점수가 돼요.
          </p>
        </div>
      )}

      {/* 이미 기준으로 채점한 문항: 무엇을 체크해 몇 점을 받았는지 그대로 남긴다(복기용). */}
      {!needsSelfGrade && savedGrading && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">채점기준 결과</span>
            <span className="font-mono text-xs font-medium tabular-nums text-foreground">
              {formatPoints(savedGrading.earnedPoints)} / {formatPoints(savedGrading.totalPoints)}점
            </span>
          </div>
          {rubric && (
            <ul className="space-y-1">
              {rubric.map((c) => {
                const on = savedGrading.checkedIds.includes(c.id);
                return (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
                      on ? "bg-correct/10 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {on ? (
                      <CheckSquare size={13} className="flex-none text-correct" />
                    ) : (
                      <Square size={13} className="flex-none" />
                    )}
                    <span className="flex-1">{c.text}</span>
                    <span className="flex-none font-mono tabular-nums">
                      {formatPoints(c.points)}점
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* 채점기준표가 없는 문항: 기존 정오 2지선다 그대로. */}
      {needsSelfGrade && !rubric && (
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

      {!isRichEmpty(item.snapshot.explanation) && (
        <div className="mt-4 rounded-lg bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <RichContent value={item.snapshot.explanation} />
        </div>
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
        {/* 틀린 문항만 — 원인을 적기 가장 좋은 순간은 방금 틀린 지금이다.
            여기가 없으면 오답노트로 가서 같은 문항을 다시 찾아 들어가야 했다. */}
        {item.answer?.isCorrect === false && (
          <Link
            href={`/notes/${item.questionId}?sessionId=${sessionId}`}
            className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-swift hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <NotebookPen size={12} /> 오답노트에 기록
          </Link>
        )}
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
