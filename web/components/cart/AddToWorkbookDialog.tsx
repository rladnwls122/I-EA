"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkbooks, useAddQuestionToWorkbook } from "@/lib/hooks";
import { useCartStore } from "@/lib/cart-store";

/** 장바구니 → 내가 가진 기존 문제집에 문항 추가. */
export function AddToWorkbookDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { items, clear } = useCartStore();
  const { data, isLoading } = useWorkbooks({ mine: true, limit: 50 }, open);
  const myWorkbooks = data?.items || [];
  const addQuestion = useAddQuestionToWorkbook();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!targetId) {
      toast.error("담을 문제집을 선택해주세요.");
      return;
    }
    setSubmitting(true);
    let added = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        await addQuestion.mutateAsync({ workbookId: targetId, questionId: item.id });
        added += 1;
      } catch {
        // 이미 담긴 문항(409) 등은 건너뛰고 계속 진행.
        skipped += 1;
      }
    }
    setSubmitting(false);
    if (added > 0) {
      toast.success(
        skipped > 0
          ? `${added}개 담았어요 (이미 있던 ${skipped}개는 건너뜀).`
          : `${added}개 문항을 담았어요.`,
      );
      clear();
      setTargetId(null);
      onClose();
    } else {
      toast.error("문항을 담지 못했어요. 이미 모두 담겨있을 수 있어요.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>내 문제집에 담기</DialogTitle>
          <DialogDescription>
            담아둔 {items.length}개 문항을 기존 문제집에 추가합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-raised" />
              ))}
            </div>
          ) : myWorkbooks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              아직 만든 문제집이 없어요. 먼저 문제집을 만들어주세요.
            </p>
          ) : (
            myWorkbooks.map((wb) => (
              <button
                key={wb.id}
                type="button"
                onClick={() => setTargetId(wb.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                  targetId === wb.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-foreground hover:border-primary/40"
                }`}
              >
                <span className="truncate">{wb.title}</span>
                <span className="ml-2 flex-none font-mono text-[11px] text-muted-foreground">
                  문항 {wb.questionCount}
                </span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting || !targetId}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            담기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
