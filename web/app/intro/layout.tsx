import type { Metadata } from "next";
import { SITE_DESCRIPTION } from "@/lib/site";

// intro/page.tsx는 클라이언트 컴포넌트라 metadata를 못 내보낸다 — 랜딩 전용 메타는 여기서.
export const metadata: Metadata = {
  title: "틀린 이유가 다음 정답이 되는 곳",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/intro" },
};

export default function IntroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
