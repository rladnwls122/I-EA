"use client";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/hooks";

export function SessionPage({ id }: { id: string }) {
  const { data: session, isLoading, isError } = useSession(id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          세션을 찾을 수 없어요.
        </p>
        <p className="text-xs text-muted-foreground">
          삭제되었거나 접근 권한이 없는 세션입니다.
        </p>
      </div>
    );
  }

  if (session.status === "EXPIRED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          만료된 세션이에요.
        </p>
        <p className="text-xs text-muted-foreground">
          제한 시간이 지나 더 이상 응시할 수 없습니다.
        </p>
      </div>
    );
  }

  if (session.status === "IN_PROGRESS") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        풀기 모드 — {session.questions.length}문항 (Task 10에서 완성)
      </div>
    );
  }

  return (
    <div className="p-8 text-sm text-muted-foreground">
      결과 모드 — {session.questions.length}문항 (Task 12에서 완성)
    </div>
  );
}
