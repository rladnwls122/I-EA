import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${SITE_NAME}가 수집하는 개인정보의 항목·목적·보관 기간·제3자 제공·쿠키 및 광고 사용과 이용자의 권리를 안내합니다.`,
  alternates: { canonical: "/privacy" },
};

// 개정 시 이 날짜와 본문을 함께 고친다. 광고 심사·법령상 시행일이 반드시 표기돼야 한다.
const EFFECTIVE_DATE = "2026년 9월 10일";

export default function PrivacyPage() {
  return (
    <>
      <h1>개인정보처리방침</h1>
      <p>
        {SITE_NAME}(이하 &ldquo;서비스&rdquo;)는 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 개인정보를 다음과 같이
        처리합니다. 본 방침은 {EFFECTIVE_DATE}부터 적용됩니다.
      </p>

      <h2>1. 수집하는 개인정보 항목과 수집 방법</h2>
      <ul>
        <li>
          <strong>회원가입 시</strong> — 이메일 주소, 비밀번호(복원 불가능한 해시 형태로만 저장), 닉네임.
        </li>
        <li>
          <strong>서비스 이용 중 자동 생성</strong> — 문항 풀이 기록(응답·정오답·소요 시간), 오답노트 메모와 하이라이트, 문제집·모의고사 구성,
          경험치·코인·스트릭 내역, AI 문항 생성 및 AI 튜터 대화 내용, AI 사용량(토큰 수).
        </li>
        <li>
          <strong>접속 기록</strong> — IP 주소, 브라우저 종류, 접속 일시. 요청 제한(rate limiting)과 보안 목적으로 짧은 기간만 보관합니다.
        </li>
        <li>
          <strong>이용자가 직접 올리는 자료</strong> — 문항에 첨부하는 이미지.
        </li>
      </ul>

      <h2>2. 개인정보의 이용 목적</h2>
      <ol>
        <li>회원 식별, 로그인 및 계정 관리</li>
        <li>문항 풀이·오답노트·모의고사 등 학습 기능 제공과 학습 통계 산출</li>
        <li>AI 문항 생성·AI 튜터 응답 생성</li>
        <li>부정 이용 방지, 서비스 안정성 확보, 요청 제한</li>
        <li>서비스 개선을 위한 이용 통계 분석</li>
        <li>광고 게재(제6항 참조)</li>
      </ol>

      <h2>3. 보유 및 이용 기간</h2>
      <p>
        회원 정보와 학습 기록은 회원 탈퇴 시까지 보관하며 탈퇴 즉시 삭제합니다. 다만 관련 법령이 일정 기간 보존을 요구하는 경우
        (예: 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 거래 기록) 해당 기간 동안 분리 보관합니다. 접속 기록은 최대 3개월 보관 후
        삭제합니다.
      </p>

      <h2>4. 개인정보의 제3자 제공</h2>
      <p>
        서비스는 이용자의 개인정보를 제3자에게 판매하거나 제공하지 않습니다. 다만 법령에 근거한 수사기관의 적법한 요청이 있는 경우는 예외로
        합니다.
      </p>

      <h2>5. 개인정보 처리의 위탁 및 국외 이전</h2>
      <p>서비스 운영을 위해 다음 사업자에게 처리를 위탁하며, 일부는 국외에 서버를 둡니다.</p>
      <ul>
        <li>
          <strong>Vercel Inc.</strong> — 웹 애플리케이션 호스팅 및 배포 (미국)
        </li>
        <li>
          <strong>PingCAP (TiDB Cloud)</strong>, <strong>Aiven</strong> — 데이터베이스·캐시 저장소 운영
        </li>
        <li>
          <strong>Amazon Web Services</strong> — 이용자가 업로드한 이미지 저장 (Amazon S3)
        </li>
        <li>
          <strong>Google LLC (Gemini API)</strong> — AI 문항 생성·AI 튜터 응답 생성. 이용자가 입력한 지문·질문 텍스트가 전송되며 이메일 등 계정
          식별 정보는 전송하지 않습니다.
        </li>
      </ul>

      <h2>6. 쿠키와 광고</h2>
      <p>
        서비스는 로그인 상태 유지를 위해 브라우저 저장소(localStorage)를 사용합니다. 또한 서비스는 <strong>Google AdSense</strong>를 통해
        광고를 게재할 수 있습니다. Google을 포함한 제3자 광고 사업자는 쿠키를 사용하여 이용자의 본 사이트 및 다른 사이트 방문 기록을 바탕으로
        관심사 기반 광고를 게재합니다. Google의 광고 쿠키 사용은{" "}
        <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          Google 광고 정책
        </a>
        에 따르며, 이용자는{" "}
        <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          Google 광고 설정
        </a>
        에서 맞춤 광고를 해제할 수 있습니다. 브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 이 경우 로그인 등 일부 기능이 제한될 수
        있습니다.
      </p>

      <h2>7. 이용자의 권리</h2>
      <p>
        이용자는 언제든지 자신의 개인정보를 열람·정정·삭제하거나 처리 정지를 요구할 수 있으며, 계정 설정 또는 아래 문의처를 통해 요청할 수
        있습니다. 회원 탈퇴 시 학습 기록을 포함한 개인정보는 제3항에 따라 삭제됩니다. 만 14세 미만 아동은 법정대리인의 동의를 얻어야 가입할 수
        있습니다.
      </p>

      <h2>8. 개인정보의 안전성 확보 조치</h2>
      <ul>
        <li>비밀번호는 bcrypt 단방향 해시로만 저장하며 원문을 보관하지 않습니다.</li>
        <li>모든 통신은 HTTPS로 암호화되며, 콘텐츠 보안 정책(CSP)·HSTS 등 보안 헤더를 적용합니다.</li>
        <li>로그인 시도 횟수 제한과 토큰 일괄 무효화(전체 기기 로그아웃) 기능을 제공합니다.</li>
        <li>데이터베이스 접근 권한을 최소화하고 접근 기록을 관리합니다.</li>
      </ul>

      <h2>9. 개인정보 보호책임자 및 문의</h2>
      <p>
        개인정보 처리에 관한 문의·불만·피해 구제 요청은 아래로 연락해 주시기 바랍니다.
        {CONTACT_EMAIL ? (
          <>
            {" "}
            이메일:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
          </>
        ) : (
          <>
            {" "}
            <Link href="/contact" className="underline underline-offset-4">
              문의 페이지
            </Link>
            를 이용해 주세요.
          </>
        )}
      </p>
      <p>
        기타 개인정보 침해 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보분쟁조정위원회(kopico.go.kr,
        1833-6972)에 문의할 수 있습니다.
      </p>

      <h2>10. 방침의 변경</h2>
      <p>본 방침이 변경되는 경우 시행 7일 전부터 서비스 내 공지로 알립니다. 시행일: {EFFECTIVE_DATE}</p>
    </>
  );
}
