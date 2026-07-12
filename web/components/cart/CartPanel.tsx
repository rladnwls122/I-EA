"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, Play, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useCreateSession } from "@/lib/hooks";
import { useCartStore } from "@/lib/cart-store";
import { AssembleDialog } from "./AssembleDialog";
import { AddToWorkbookDialog } from "./AddToWorkbookDialog";

/** 장바구니 패널 — 담은 문항 목록 + 조립 액션(세션 풀기 / 새 문제집 / 기존 문제집에 담기 / 비우기). */
export function CartPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { items, remove, clear } = useCartStore();
  const createSession = useCreateSession();
  const [assembleOpen, setAssembleOpen] = useState(false);
  const [addToWorkbookOpen, setAddToWorkbookOpen] = useState(false);

  const startSession = () => {
    if (items.length === 0) return;
    createSession.mutate(
      { questionIds: items.map((i) => i.id) },
      {
        onSuccess: (res) => {
          clear();
          router.push(`/exam-sessions/${res.id}`);
        },
        onError: () => toast.error("세션 생성에 실패했습니다."),
      },
    );
  };

  return (
    <>
      {/* 모바일에서 화면 밖으로 넘치지 않도록 max-w로 가둔다(데스크톱은 기존 320px 그대로). */}
      <div className="fixed bottom-24 right-6 z-50 flex max-h-[70vh] w-[320px] max-w-[calc(100vw-3rem)] flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">
            담은 문제 <span className="font-mono text-primary">{items.length}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              문제 미리보기에서 담아보세요.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 border-b border-border py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[9px] font-medium">
                      {item.questionType}
                    </Badge>
                    {item.subjectName && (
                      <span className="text-[10px] text-muted-foreground">
                        {item.subjectName}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                    {item.stemText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="빼기"
                  className="mt-0.5 flex-none text-muted-foreground transition-colors hover:text-wrong"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex-none space-y-2 border-t border-border p-3">
          <button
            type="button"
            onClick={startSession}
            disabled={items.length === 0 || createSession.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {createSession.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            세션으로 풀기
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssembleOpen(true)}
              disabled={items.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
            >
              <Save size={13} /> 새 문제집
            </button>
            <button
              type="button"
              onClick={() => setAddToWorkbookOpen(true)}
              disabled={items.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
            >
              <FolderPlus size={13} /> 내 문제집에 담기
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={items.length === 0}
              aria-label="비우기"
              className="flex items-center justify-center rounded-lg border border-border px-3 text-muted-foreground transition-colors hover:border-wrong/40 hover:text-wrong disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <AssembleDialog open={assembleOpen} onClose={() => setAssembleOpen(false)} />
      <AddToWorkbookDialog open={addToWorkbookOpen} onClose={() => setAddToWorkbookOpen(false)} />
    </>
  );
}
