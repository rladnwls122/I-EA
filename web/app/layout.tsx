import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });

export const metadata: Metadata = { title: "IΔEA | 공부의 흐름을 설계하다", description: "AI 문제은행과 오답노트" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" className={geistSans.variable}><body><Providers>{children}</Providers></body></html>;
}
