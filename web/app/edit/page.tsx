"use client";
import { useSearchParams } from "next/navigation";
import { AuthoringCanvas } from "@/components/workbook/AuthoringCanvas";

export default function EditPage() {
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
