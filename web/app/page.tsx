"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  const router = useRouter();

  // 비로그인 첫 방문은 인트로로 보낸다. '둘러보기'로 들어온 세션(introSeen)은 그대로 통과 —
  // 인트로 ↔ 홈 리다이렉트 루프 방지. (마케팅은 /intro가, 홈은 대시보드가 담당)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("token") && !sessionStorage.getItem("introSeen")) {
      router.replace("/intro");
    }
  }, [router]);

  return <Dashboard />;
}
