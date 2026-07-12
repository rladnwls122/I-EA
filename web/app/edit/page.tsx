"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthoringCanvas } from "@/components/workbook/AuthoringCanvas";

// useSearchParams()는 정적 프리렌더 시 Suspense 경계가 필요하다(Next 14 규칙).
// 경계가 없으면 next build가 "/edit" 프리렌더 단계에서 실패한다.
function EditPageInner() {
  const params = useSearchParams();
  const workbookId = params.get("workbookId");
  if (!workbookId) {
    return (
      <main className="p-8 text-sm text-muted-foreground">
        workbookId가 필요합니다. 문제집 만들기에서 다시 시작해주세요.
      </main>
    );
  }
  return <AuthoringCanvas workbookId={workbookId} />;
}

export default function EditPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-muted-foreground">불러오는 중…</main>}>
      <EditPageInner />
    </Suspense>
  );
}
