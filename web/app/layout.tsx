import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/layout/AppSidebar";

// Geist — 본문/제목. Solves와 같은 서체 계열로 정돈된 인상.
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
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
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-background text-foreground min-h-screen pl-[64px] font-sans antialiased">
        <Providers>
          <AppSidebar />
          <main className="w-full min-h-screen selection:bg-primary selection:text-primary-foreground">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
