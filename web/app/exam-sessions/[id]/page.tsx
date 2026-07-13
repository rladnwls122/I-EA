"use client";
import { useParams } from "next/navigation";
import { SessionPage } from "@/components/exam-session/SessionPage";

export default function ExamSessionRoute() {
  const { id } = useParams() as { id: string };
  return <SessionPage id={id} />;
}
