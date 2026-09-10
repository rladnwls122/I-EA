import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — AI 문제은행과 오답노트`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Windows 로컬 빌드에서 @vercel/og 프리렌더가 fileURLToPath로 죽는다(Next 14 알려진 문제) — 요청 시 렌더로 우회.
export const dynamic = "force-dynamic";

/** 링크 공유(카톡·슬랙·트위터) 미리보기 카드. 빌드 타임에 한 번 그려진다. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 96,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -4 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 48, marginTop: 24, color: "#cbd5e1" }}>{SITE_TAGLINE}</div>
        <div style={{ fontSize: 32, marginTop: 48, color: "#94a3b8" }}>AI 문제은행 · 오답노트 · 모의고사 · AI 튜터</div>
      </div>
    ),
    size,
  );
}
