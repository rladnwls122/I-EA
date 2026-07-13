import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Toaster } from "@/components/ui/sonner";

// Pretendard — 본문/제목. 한글이 정갈하게 떨어지는 세련된 산세리프(가변 폰트).
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

// Geist Mono — 데이터(조회수·정답률·난이도) 전용. 숫자를 tabular하게.
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = { title: "IΔEA | 공부의 흐름을 설계하다", description: "AI 문제은행과 오답노트" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${pretendard.variable} ${geistMono.variable}`}>
      <body className="bg-background text-foreground min-h-screen pb-14 font-sans antialiased md:pb-0 md:pl-[64px]">
        <Providers>
          <AppSidebar />
          <main className="w-full min-h-screen selection:bg-primary selection:text-primary-foreground">
            <AuthGuard>{children}</AuthGuard>
          </main>
          {/* 앱 전역 액션 결과(성공/실패) 토스트 — 화면 중앙 하단 */}
          <Toaster position="bottom-center" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
