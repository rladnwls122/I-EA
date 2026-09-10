import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    ...PUBLIC_PAGES.map(({ path }) => ({
      url: `${SITE_URL}${path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: path === "/intro" ? 0.9 : 0.5,
    })),
  ];
}
