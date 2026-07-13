"use client";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SubmitDialog({
  open,
  unansweredCount,
  onConfirm,
  onCancel,
  isSubmitting,
}: {
  open: boolean;
  unansweredCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>제출할까요?</DialogTitle>
          <DialogDescription>
            {unansweredCount > 0
              ? `아직 풀지 않은 문항이 ${unansweredCount}개 있어요. 제출하면 되돌릴 수 없습니다.`
              : "모든 문항에 답했어요. 제출하면 채점 결과를 바로 확인할 수 있습니다."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : null}
            제출하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
