"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteQuestion, useMe, useQuestion } from "@/lib/hooks";
import { QuestionArticle } from "./QuestionArticle";
import { QuestionEditForm } from "./QuestionEditForm";
import { ExplanationPanel } from "./ExplanationPanel";
import { StatsPanel } from "./StatsPanel";
import { RatingPanel } from "./RatingPanel";
import { CommentSidebar } from "./CommentSidebar";

/**
 * 문항 상세 셸 — 헤더([채점결과↔문제탐색] 토글) + 좌 본문 / 우 댓글 2열.
 * "채점 결과" 탭은 solvedByMe(백엔드가 판정)일 때만 활성화 — 안 풀었으면 토글 자체를 막는다.
 */
export function QuestionDetail({
  id,
  initialReveal,
}: {
  id: string;
  initialReveal: boolean;
}) {
  const router = useRouter();
  const { data: question, isLoading, isError } = useQuestion(id);
  const { data: me } = useMe();
  const deleteQuestion = useDeleteQuestion();
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const solved = !!question?.solvedByMe;
  const isOwner = !!me && !!question && me.id === question.creatorId;

  const handleDelete = () => {
    if (!question) return;
    if (!window.confirm("이 문항을 삭제할까요? 보관 처리되어 목록에서 사라집니다.")) return;
    deleteQuestion.mutate(question.id, {
      onSuccess: () => {
        toast.success("문항을 삭제했어요.");
        router.push("/questions");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "삭제에 실패했어요."),
    });
  };

  useEffect(() => {
    if (initialReveal && solved) setReveal(true);
  }, [initialReveal, solved]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (isError || !question) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">문항을 찾을 수 없어요.</p>
        <p className="text-xs text-muted-foreground">삭제되었거나 잘못된 주소입니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {question.subject
              ? `${question.subject.examCategory} · ${question.subject.name}`
              : "문항 상세"}
          </span>
        </div>

        <div className="flex-1" />

        {isOwner && !editing && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Pencil size={13} /> 수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteQuestion.isPending}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
            >
              {deleteQuestion.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} 삭제
            </button>
          </div>
        )}

        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => solved && setReveal(true)}
            disabled={!solved}
            aria-pressed={reveal}
            title={solved ? undefined : "문제를 풀어야 채점 결과를 볼 수 있어요"}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              reveal
                ? "bg-primary/10 text-primary"
                : solved
                  ? "text-muted-foreground hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/40"
            }`}
          >
            채점 결과
          </button>
          <button
            type="button"
            onClick={() => setReveal(false)}
            aria-pressed={!reveal}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              !reveal ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            문제 탐색
          </button>
        </div>
      </header>

      {/* 본문 2열 */}
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-5 lg:flex-row">
        <main className="mx-auto w-full max-w-[772px] flex-1 space-y-4">
          {editing ? (
            <QuestionEditForm question={question} onDone={() => setEditing(false)} />
          ) : (
            <QuestionArticle question={question} reveal={reveal} />
          )}
          {!editing && reveal && <ExplanationPanel explanation={question.explanation} />}
          {reveal && <StatsPanel questionId={id} />}
          <RatingPanel questionId={id} />
        </main>
        <CommentSidebar questionId={id} />
      </div>
    </div>
  );
}
