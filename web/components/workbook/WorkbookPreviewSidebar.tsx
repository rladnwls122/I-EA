"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Play, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuestion, useWorkbook, useStartWorkbook } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import { useCartStore } from "@/lib/cart-store";
import { QuestionArticle } from "@/components/question-detail/QuestionArticle";

/**
 * 문제집 미리보기 — 문항 상세가 주 화면(좌/상), 우측(모바일 하단)은 수록 문항 인덱스.
 * 인덱스에서 문항을 고르면 그 자리에서 상세로 전환돼 시선 이동이 크지 않다.
 * 인덱스 항목마다 장바구니 담기, 패널 하단에 [풀기]와 [미리보기 닫기(←)].
 * 미발행 문항은 백엔드가 세션 조립 시 제외(skippedQuestionIds) → 토스트로 안내.
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
  const { add, remove, has } = useCartStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const questions = workbook?.questions || [];

  // 문제집이 바뀌거나 처음 열리면 첫 문항을 자동 선택.
  useEffect(() => {
    if (questions.length > 0 && !questions.some((q) => q.questionId === selectedId)) {
      setSelectedId(questions[0].questionId);
    }
  }, [questions, selectedId]);

  // 선택한 문항의 전체 콘텐츠(선지·지문·해설)는 목록 응답에 없어 별도 조회.
  const { data: detail, isLoading: detailLoading } = useQuestion(selectedId);

  if (!workbookId) return null;

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
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 backdrop-blur-sm md:items-center md:p-6"
      onMouseDown={onClose}
    >
      <div
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden border-border bg-background shadow-2xl md:h-[90vh] md:flex-row md:rounded-2xl md:border"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 좌(모바일 상단): 선택한 문항 상세 */}
        <main className="order-1 min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : questions.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              수록된 문항이 없는 문제집이에요.
            </p>
          ) : detailLoading || !detail ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <QuestionArticle question={detail} reveal={false} />
          )}
        </main>

        {/* 우(모바일 하단): 수록 문항 인덱스 + 하단 액션 */}
        <aside className="order-2 flex max-h-[45vh] min-h-0 w-full flex-col border-t border-border bg-card md:max-h-none md:w-80 md:border-l md:border-t-0">
          {/* 헤더 */}
          <div className="border-b border-border p-5">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              문제집 미리보기
            </span>
            {isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : (
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {workbook?.title ?? "문제집"}
              </h2>
            )}
            {workbook && (
              <div className="mt-2 flex items-center gap-2">
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
            )}
          </div>

          {/* 인덱스 목록 */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              수록 문항
            </span>
            <div className="mt-2 space-y-1">
              {questions.map((wq, i) => {
                const active = selectedId === wq.questionId;
                const inCart = has(wq.questionId);
                return (
                  <div
                    key={wq.questionId}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 transition-colors ${
                      active
                        ? "border-primary/50 bg-primary/5"
                        : "border-transparent hover:bg-surface-raised"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(wq.questionId)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span
                        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border font-mono text-[10px] ${
                          active ? "border-primary text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={`line-clamp-2 text-[13px] leading-relaxed ${
                          active ? "text-foreground" : "text-foreground/90"
                        }`}
                      >
                        {wq.question ? extractPlainText(wq.question.stem) : "문항"}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={inCart ? "담김 — 빼려면 클릭" : "이 문항만 담기"}
                      onClick={() => {
                        if (inCart) {
                          remove(wq.questionId);
                          toast.success("장바구니에서 뺐어요.");
                          return;
                        }
                        if (!wq.question) return;
                        add({
                          id: wq.questionId,
                          stemText: extractPlainText(wq.question.stem),
                          subjectName: wq.question.subject?.name,
                          questionType: wq.question.questionType,
                        });
                        toast.success("문제를 담았어요.");
                      }}
                      className={`flex h-7 w-7 flex-none items-center justify-center rounded-md border transition-colors ${
                        inCart
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {inCart ? <Check size={13} /> : <ShoppingBasket size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 액션 — 풀기 + 미리보기 닫기(←) */}
          <div className="space-y-2 border-t border-border p-4">
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
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <ArrowLeft size={15} /> 미리보기 닫기
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
