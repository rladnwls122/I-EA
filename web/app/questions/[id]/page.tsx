"use client";
import { useParams, useSearchParams } from "next/navigation";
import { QuestionDetail } from "@/components/question-detail/QuestionDetail";

export default function QuestionDetailRoute() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  // 세션 결과/오답노트에서 진입하면 ?reveal=1 — 채점결과 모드로 시작
  return <QuestionDetail id={id} initialReveal={searchParams.get("reveal") === "1"} />;
}
