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
import { Input } from "@/components/ui/input";
import { useCreateWorkbook } from "@/lib/hooks";
import { useCartStore } from "@/lib/cart-store";

/** 장바구니 → 문제집 저장 다이얼로그. 성공 시 장바구니 비움. */
export function AssembleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { items, clear } = useCartStore();
  const createWorkbook = useCreateWorkbook();
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");

  const submit = () => {
    if (!title.trim()) {
      toast.error("문제집 제목을 입력해주세요.");
      return;
    }
    createWorkbook.mutate(
      {
        title: title.trim(),
        visibility,
        questionIds: items.map((i) => i.id),
      },
      {
        onSuccess: () => {
          toast.success("문제집이 만들어졌습니다.");
          clear();
          setTitle("");
          onClose();
        },
        onError: () => toast.error("문제집 저장에 실패했습니다."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>문제집으로 저장</DialogTitle>
          <DialogDescription>
            담아둔 {items.length}개 문항으로 새 문제집을 만듭니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="문제집 제목"
            className="h-11"
          />
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(
              [
                ["PRIVATE", "비공개"],
                ["PUBLIC", "공개"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVisibility(key)}
                aria-pressed={visibility === key}
                className={`flex-1 rounded-md py-2.5 text-[13px] font-medium transition-colors duration-150 ease-swift ${
                  visibility === key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createWorkbook.isPending}>
            취소
          </Button>
          <Button onClick={submit} disabled={createWorkbook.isPending}>
            {createWorkbook.isPending && <Loader2 size={14} className="animate-spin" />}
            저장하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
