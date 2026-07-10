import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/layout/AppSidebar";

const nunito = Nunito({ 
  subsets: ["latin"], 
  variable: "--font-nunito", 
  weight: ["400", "700", "800", "900"] 
});

export const metadata: Metadata = { title: "IΔEA | 공부의 흐름을 설계하다", description: "AI 문제은행과 오답노트" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={nunito.variable}>
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
