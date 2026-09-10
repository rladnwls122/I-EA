import type { Metadata } from "next";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "문의",
  description: `${SITE_NAME}에 대한 문의·제안·저작권 신고·개인정보 요청을 보내는 방법을 안내합니다.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <h1>문의</h1>
      <p>서비스 이용 중 궁금한 점, 오류 제보, 기능 제안, 저작권 침해 신고, 개인정보 열람·삭제 요청을 보내 주세요.</p>

      <h2>이메일</h2>
      {CONTACT_EMAIL ? (
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          로 보내 주시면 영업일 기준 3일 안에 답변합니다.
        </p>
      ) : (
        // ponytail: NEXT_PUBLIC_CONTACT_EMAIL 미설정 시 안내만 — 폼 백엔드는 문의량 생기면.
        <p>문의 이메일 주소는 준비 중입니다. 그동안은 서비스 내 계정 페이지의 안내를 따라 주세요.</p>
      )}

      <h2>보내실 때 알려 주시면 좋은 것</h2>
      <ul>
        <li>가입 이메일(개인정보 요청 시 본인 확인용)</li>
        <li>문제가 생긴 화면과 시각, 문항 ID(주소창의 UUID)</li>
        <li>저작권 신고의 경우 권리를 증명할 수 있는 자료</li>
      </ul>
    </>
  );
}
