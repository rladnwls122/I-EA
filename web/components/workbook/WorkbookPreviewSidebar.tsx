"use client";
import { useRouter } from "next/navigation";
import { Eye, GitFork, Loader2, Play, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkbook, useStartWorkbook } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";

/**
 * 문제집 미리보기 사이드바 — 카드 클릭으로 열리고, [풀기]로 세션 시작.
 * 미발행 문항은 백엔드가 제외(skippedQuestionIds) → 토스트로 안내.
 */
export function WorkbookPreviewSidebar({
  workbookId,
  onClose,
}: {
  workbookId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: workbook, isLoading } = useWorkbook(workbookId);
  const startWorkbook = useStartWorkbook();

  if (!workbookId) return null;

  const questions = workbook?.questions || [];

  const solve = () => {
    startWorkbook.mutate(workbookId, {
      onSuccess: (res) => {
        if ((res.skippedQuestionIds || []).length > 0) {
          toast.info(`발행되지 않은 ${res.skippedQuestionIds.length}개 문항은 제외됐어요.`);
        }
        router.push(`/exam-sessions/${res.id}`);
      },
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "세션 생성에 실패했습니다."),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-border p-6">
          <div className="min-w-0">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              문제집 미리보기
            </span>
            {isLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <h2 className="truncate text-xl font-semibold tracking-tight">
                {workbook?.title ?? "문제집"}
              </h2>
            )}
          </div>
          <button
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : workbook ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    workbook.visibility === "PUBLIC"
                      ? "bg-primary/10 text-primary hover:bg-primary/10"
                      : ""
                  }
                >
                  {workbook.visibility === "PUBLIC" ? "공개" : "비공개"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  문항 {workbook.questionCount}개
                </span>
              </div>

              {workbook.description && (
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  {workbook.description}
                </p>
              )}

              <div className="mb-6 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye size={13} /> {workbook.viewCount}
                </span>
                <span className="flex items-center gap-1">
                  <GitFork size={13} /> {workbook.forkCount}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={13} /> {workbook.attemptCount}
                </span>
              </div>

              {questions.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    수록 문항
                  </span>
                  {questions.map((wq, i) => (
                    <div
                      key={wq.questionId}
                      className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3"
                    >
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-border font-mono text-[10px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/90">
                        {wq.question ? extractPlainText(wq.question.stem) : "문항"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              문제집을 불러오지 못했어요.
            </p>
          )}
        </div>

        {/* 풀기 */}
        <div className="border-t border-border p-6">
          <Button
            onClick={solve}
            size="lg"
            className="w-full"
            disabled={isLoading || startWorkbook.isPending || !workbook}
          >
            {startWorkbook.isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Play size={18} />
            )}
            이 문제집 풀기
          </Button>
        </div>
      </aside>
    </div>
  );
}
