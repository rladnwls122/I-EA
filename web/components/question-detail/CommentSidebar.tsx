"use client";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useComments, useCreateComment } from "@/lib/hooks";
import type { QuestionComment } from "@/lib/types";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function CommentItem({ comment }: { comment: QuestionComment }) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-muted-foreground">
          {comment.author?.nickname?.slice(0, 1) ?? "?"}
        </span>
        <span className="text-[13px] font-semibold text-foreground">
          {comment.author?.nickname ?? "익명"}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {timeAgo(comment.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
        {comment.content}
      </p>
      {(comment.replies || []).length > 0 && (
        <div className="mt-3 space-y-3 border-l border-border pl-3">
          {(comment.replies || []).map((r) => (
            <CommentItem key={r.id} comment={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 댓글 사이드바. [풀이 토론/Q&A] 세그먼트는 시각적 구분만(백엔드에 카테고리 없음 —
 * MVP는 단일 목록, 스펙에 명시된 결정).
 */
export function CommentSidebar({ questionId }: { questionId: string }) {
  const { data: comments, isLoading } = useComments(questionId);
  const createComment = useCreateComment();
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"discuss" | "qna">("discuss");

  const list = comments || [];

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    createComment.mutate(
      { questionId, data: { content } },
      {
        onSuccess: () => setDraft(""),
        onError: () => toast.error("댓글 등록에 실패했습니다."),
      },
    );
  };

  return (
    <aside className="flex w-full flex-col rounded-xl border border-border bg-card lg:w-[376px] lg:flex-none">
      <div className="flex-none p-4 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">댓글</span>
          <span className="font-mono text-[11px] text-muted-foreground">{list.length}개</span>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
          {(
            [
              ["discuss", "풀이 토론"],
              ["qna", "질문 · Q&A"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[560px] flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            첫 댓글을 남겨보세요.
          </p>
        ) : (
          list.map((c) => <CommentItem key={c.id} comment={c} />)
        )}
      </div>

      <div className="flex-none border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="댓글을 입력하세요"
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={submit}
            disabled={createComment.isPending || !draft.trim()}
            aria-label="댓글 등록"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {createComment.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
