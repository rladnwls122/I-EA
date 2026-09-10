import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "서비스 안내",
  description:
    `${SITE_NAME}가 무엇을 하는 서비스인지, 문제은행·오답노트·모의고사·AI 튜터가 어떻게 하나의 학습 루프로 이어지는지 설명합니다.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <h1>{SITE_NAME} 서비스 안내</h1>
      <p>
        {SITE_NAME}(아이디어)는 &ldquo;공부의 흐름을 설계하다&rdquo;를 목표로 만든 수험생용 학습 플랫폼입니다.
        문제를 푸는 것에서 끝나지 않고, <strong>왜 틀렸는지</strong>를 기록하고, 약한 유형을 AI가 새 문항으로 되돌려주는
        반복 루프를 하나의 화면 흐름으로 묶었습니다. 국어·수학·영어·탐구 등 한국 교육과정의 과목·세부과목 체계를 그대로 따릅니다.
      </p>

      <h2>무엇을 할 수 있나요</h2>
      <ul>
        <li>
          <strong>문제은행</strong> — 과목·세부과목·난이도·유형(객관식/주관식)·태그로 문항을 검색하고, 문항별 정답률과 선지 분포를 확인합니다.
        </li>
        <li>
          <strong>문제집·모의고사</strong> — 골라 담은 문항을 문제집으로 묶고 그대로 응시합니다. 응시 시점의 문항을 스냅샷으로 보관하므로
          나중에 원본이 수정돼도 채점 결과는 바뀌지 않습니다. 객관식과 단답형은 자동 채점, 서술형은 직접 채점합니다.
        </li>
        <li>
          <strong>오답노트</strong> — 틀린 문항의 지문·선지 위에 밑줄·형광펜을 긋고 메모를 남깁니다. 개념부족·실수·시간부족 같은 오답 원인
          태그가 쌓여 과목별·유형별·원인별 통계가 됩니다.
        </li>
        <li>
          <strong>AI 문항 생성과 튜터</strong> — 지문과 조건을 주면 AI가 새 문항을 만들어 출제자가 검토·발행합니다. 풀이 중 막히면 AI 튜터에게
          힌트를 요청할 수 있습니다. AI가 만든 문항은 반드시 사람이 검수한 뒤 공개됩니다.
        </li>
        <li>
          <strong>성장 기록</strong> — 정답과 학습 활동에 따라 경험치와 코인이 쌓이고, 연속 학습 스트릭과 상점 보상으로 동기를 이어 갑니다.
        </li>
      </ul>

      <h2>누가 만들었나요</h2>
      <p>
        {SITE_NAME}는 수험 공부의 반복 과정을 소프트웨어로 덜어 주고 싶었던 개발자들이 만들고 있습니다. 문항 데이터는 출제자가 직접
        작성하거나 AI 초안을 검수해 등록하며, 저작권이 있는 기출 문항을 무단으로 수록하지 않습니다.
      </p>

      <h2>시작하기</h2>
      <p>
        <Link href="/intro" className="underline underline-offset-4">
          소개 페이지
        </Link>
        에서 둘러보거나,{" "}
        <Link href="/signup" className="underline underline-offset-4">
          회원가입
        </Link>{" "}
        후 바로 문항을 골라 풀어 볼 수 있습니다. 궁금한 점은{" "}
        <Link href="/contact" className="underline underline-offset-4">
          문의
        </Link>
        로 보내 주세요.
      </p>
    </>
  );
}
