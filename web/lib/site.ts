/**
 * 사이트 정체 상수. metadata/sitemap/robots/OG 이미지/법적 고지가 전부 여기서 읽는다.
 * 커스텀 도메인을 붙이면 NEXT_PUBLIC_SITE_URL만 바꾸면 된다(빌드 타임 값).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://i-ea-web.vercel.app";
export const SITE_NAME = "IΔEA";
export const SITE_TAGLINE = "공부의 흐름을 설계하다";
export const SITE_DESCRIPTION =
  "IΔEA(아이디어)는 AI가 만드는 문제은행과 오답노트로 공부의 흐름을 설계하는 한국 수험생용 학습 플랫폼입니다. " +
  "과목·난이도별 문항 선택, 모의고사 응시, 오답 원인 분석, AI 튜터까지 한곳에서.";
/** 문의처. 비우면 문의 페이지가 이메일 대신 안내 문구만 보여 준다. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

/** 검색엔진에 노출할 공개 페이지. sitemap과 인트로 푸터가 같이 쓴다. */
export const PUBLIC_PAGES = [
  { path: "/intro", label: "소개" },
  { path: "/about", label: "서비스 안내" },
  { path: "/privacy", label: "개인정보처리방침" },
  { path: "/terms", label: "이용약관" },
  { path: "/contact", label: "문의" },
] as const;
