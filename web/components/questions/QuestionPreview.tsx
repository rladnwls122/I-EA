"use client";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Play, ShoppingBasket, X } from "lucide-react";
import { toast } from "sonner";
import type { Question } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { extractPlainText } from "@/lib/prosemirror";
import { useCartStore } from "@/lib/cart-store";
import { useCreateSession, useQuestion } from "@/lib/hooks";

export function QuestionPreview({
  question,
  onClose,
}: {
  question: Question | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { add, remove, has } = useCartStore();
  const createSession = useCreateSession();
  // 목록 응답엔 선지/해설이 없다 — 열리면 상세를 재조회해 점진 보강.
  const { data: full } = useQuestion(question?.id ?? null);

  if (!question) return null;
  const q = full ?? question;

  // choices는 실 API에선 배열([{id,content,isCorrect}]), 레거시 목업에선 {content:[]} — 양쪽 방어.
  const choices: any[] = Array.isArray(q.choices)
    ? q.choices
    : q.choices?.content || [];

  const inCart = has(question.id);

  const toggleCart = () => {
    if (inCart) {
      remove(question.id);
      return;
    }
    add({
      id: question.id,
      stemText: extractPlainText(q.stem),
      subjectName: question.subject?.name,
      questionType: q.questionType,
    });
  };

  const solveNow = () => {
    createSession.mutate(
      { questionIds: [question.id] },
      {
        onSuccess: (res) => router.push(`/exam-sessions/${res.id}`),
        onError: () => toast.error("세션 생성에 실패했습니다."),
      },
    );
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
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              문제 미리보기
            </span>
            <h2 className="text-xl font-semibold tracking-tight">
              {q.subject?.name || "과목 미지정"}
            </h2>
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
          <div className="mb-6 flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
              {q.questionType}
            </Badge>
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              난이도
              <span className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`h-1.5 w-1.5 rounded-full ${
                      n <= q.difficulty ? "bg-primary" : "bg-border"
                    }`}
                  />
                ))}
              </span>
            </span>
          </div>

          <p className="mb-8 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {extractPlainText(q.stem)}
          </p>

          {q.questionType === "객관식" ? (
            <div className="mb-8 space-y-2">
              {choices.map((c: any, i: number) => (
                <div
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3.5"
                  key={c?.id ?? i}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-foreground/90">
                    {extractPlainText(c?.content ?? c)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-8 rounded-lg border border-dashed border-border bg-surface-raised p-5 text-center">
              <p className="text-sm text-muted-foreground">
                답안을 직접 입력하는 주관식 문항입니다.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-raised p-3.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              문제를 풀기 전에는 정답과 해설이 공개되지 않습니다.
            </p>
          </div>
        </div>

        {/* 액션: 장바구니 담기 / 바로 풀기 */}
        <div className="space-y-2.5 border-t border-border p-6">
          <Button
            onClick={toggleCart}
            size="lg"
            className="w-full"
            variant={inCart ? "secondary" : "default"}
          >
            {inCart ? (
              <>
                <Check size={18} /> 담김 — 빼려면 클릭
              </>
            ) : (
              <>
                <ShoppingBasket size={18} /> 문제 담기
              </>
            )}
          </Button>
          <Button
            onClick={solveNow}
            size="lg"
            variant="outline"
            className="w-full"
            disabled={createSession.isPending}
          >
            {createSession.isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Play size={18} />
            )}
            이 문제 바로 풀기
          </Button>
        </div>
      </aside>
    </div>
  );
}
