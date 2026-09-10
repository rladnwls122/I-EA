import Link from "next/link";
import { PUBLIC_PAGES, SITE_NAME } from "@/lib/site";

/**
 * 공개 문서 페이지(서비스 안내·개인정보처리방침·이용약관·문의) 공통 틀.
 * 서버 컴포넌트 — 크롤러가 JS 없이도 본문을 읽는다. 하단 링크로 문서끼리 서로 연결해
 * 검색엔진·광고 심사 봇이 한 페이지에서 나머지를 전부 찾을 수 있게 한다.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-20">
      <article className="prose-legal space-y-6 text-[15px] leading-relaxed text-foreground [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-muted-foreground">
        {children}
      </article>
      <nav aria-label="사이트 문서" className="mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 font-mono text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          {SITE_NAME} 홈
        </Link>
        {PUBLIC_PAGES.map(({ path, label }) => (
          <Link key={path} href={path} className="hover:text-foreground">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
