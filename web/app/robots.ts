import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** 로그인 뒤 화면은 크롤러에 빈 껍데기라 색인 대상에서 뺀다. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/me", "/notes", "/edit", "/exam-sessions/", "/workbook", "/shop", "/login", "/signup"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
