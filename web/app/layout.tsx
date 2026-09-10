import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Toaster } from "@/components/ui/sonner";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

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

const TITLE = `${SITE_NAME} | ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  // 상대 URL(canonical/OG 이미지)을 절대 URL로 풀어 주는 기준.
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: ["문제은행", "오답노트", "AI 문제 생성", "모의고사", "수능", "내신", "학습 플랫폼", "AI 튜터"],
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    url: "/",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

/** Google AdSense 게시자 ID(ca-pub-…). 비우면 스크립트를 넣지 않는다 — 심사 신청 시 Vercel env로 켠다. */
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

/** 검색엔진용 구조화 데이터 — 사이트/조직 정체를 기계가 읽을 수 있게. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/idea.svg` },
    { "@type": "WebSite", name: SITE_NAME, url: SITE_URL, inLanguage: "ko", description: SITE_DESCRIPTION },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${pretendard.variable} ${geistMono.variable}`}>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      </head>
      {/* print: 시험지 인쇄 뷰(workbook/[id]/print)에서 레일 여백이 종이에 남지 않도록 리셋 */}
      <body className="bg-background text-foreground min-h-screen pb-14 font-sans antialiased md:pb-0 md:pl-[64px] print:!bg-white print:!p-0">
        <Providers>
          <AppSidebar />
          <main className="w-full min-h-screen selection:bg-primary selection:text-primary-foreground">
            <AuthGuard>{children}</AuthGuard>
          </main>
          {/* 앱 전역 액션 결과(성공/실패) 토스트 — 화면 중앙 하단 */}
          <Toaster position="bottom-center" richColors closeButton />
        </Providers>
        {ADSENSE_CLIENT && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
