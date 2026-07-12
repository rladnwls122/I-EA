"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthoringCanvas } from "@/components/workbook/AuthoringCanvas";

// useSearchParams()는 정적 프리렌더 시 Suspense 경계가 필요하다(Next 14 규칙).
// 경계가 없으면 next build가 "/edit" 프리렌더 단계에서 실패한다.
function EditPageInner() {
  const params = useSearchParams();
  const workbookId = params.get("workbookId");
  const initialSubjectId = params.get("subjectId");
  if (!workbookId) {
    return (
      <main className="p-8 text-sm text-muted-foreground">
        workbookId가 필요합니다. 문제집 만들기에서 다시 시작해주세요.
      </main>
    );
  }
  // key={workbookId} — 다른 문제집으로 이동해도(같은 라우트 안에서 client 전환) 컴포넌트를
  // 강제로 새로 마운트한다. 그렇지 않으면 이전 문제집의 채팅 세션·선택 과목이 그대로 남는다.
  return (
    <AuthoringCanvas
      key={workbookId}
      workbookId={workbookId}
      initialSubjectId={initialSubjectId || undefined}
    />
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-muted-foreground">불러오는 중…</main>}>
      <EditPageInner />
    </Suspense>
  );
}
