# Q-Idea 프론트엔드 1주 E2E 데모 Implementation Plan

> **작성일: 2026-07-06 (2026-07-09 최신 스펙 반영하여 갱신됨)**
> 
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 배포된 NestJS 백엔드 위에, Next.js 프론트엔드로 출제자→응시자 골든패스 E2E 데모 + 수험생 생태계 기능(리뷰·댓글·오답노트)을 1주 안에 완성한다.

**Architecture:** 기존 NestJS API(Railway) 재사용. Next.js(App Router)가 orval 자동생성 타입 클라이언트로 REST 호출. 백엔드는 CORS·시드 최소 추가.

**Tech Stack:** Next.js 14(App Router), TypeScript strict, Tailwind CSS 3, shadcn/ui, TanStack Query v5, Zustand v4, orval, react-vega (정적 차트용), @tiptap/react, perfect-freehand, zod, @google/generative-ai. 백엔드: NestJS 10 + Prisma(MySQL). (KaTeX, Vega 자동 생성은 제외됨)

## Global Constraints

- TypeScript strict, `any` 금지.
- 프론트 디렉터리 규약: `app/`(페이지·레이아웃·Route Handler), `components/`, `hooks/`, `lib/`, `types/`.
- 스타일: Tailwind + shadcn/ui, `cn`(clsx+tailwind-merge). RSC 기본, 훅/브라우저 API 쓰는 곳만 `"use client"`. 프리미엄 다크 테마 적용.
- 백엔드 API 프리픽스 `/api`. 클라이언트는 `Authorization: Bearer <accessToken>` 첨부.
- 프론트 앱 위치: `web/` (백엔드 repo 하위 별도 Next 앱). 패키지매니저: **npm**.
- **배포 타깃: Cloudflare Pages**. Route Handler는 `export const runtime = 'edge'` 필수. 
- 커밋 자주. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**백엔드 (신규/수정):**
- Create `prisma/seed.ts` — 3단 분류(examType 포함) 데모 유저·과목·문항 시드.
- Modify `package.json` — `db:seed` 스크립트.

**프론트 (`web/`):**
- `web/lib/` — `api-client.ts`(orval mutator), `auth.ts`(토큰 스토어), `cn.ts`, `query-client.ts`.
- `web/hooks/generated/` — orval 산출물.
- `web/types/` — `canvas.ts`(stroke 스키마).
- `web/components/` — `ui/*`(shadcn), `layout/AppSidebar.tsx`, `editor/QuestionViewer.tsx`, `canvas/SketchCanvas.tsx`.
- `web/app/` — 화면별 라우트(3-Section 레이아웃 적용).

---

## Task 0: 데모 시드 + 빌드 검증

- [ ] **Step 1: 시드 스크립트 작성** (`prisma/seed.ts`)
  - 3단 분류(`examType: '수능'`, `examCategory: '국어'`, `name: '문학'`) 적용.
  - 데모 유저(출제자, 응시자) 추가.
  - PUBLISHED 객관식/주관식 문항 추가.
- [ ] **Step 2: seed 스크립트 등록**
- [ ] **Step 3: 시드 실행 검증**

---

## Task 1 & 2: Next.js 앱 스캐폴딩 + Tailwind + shadcn + Query Provider

- [ ] **Step 1: Next 앱 생성**
  - `npx create-next-app@14 web ...`
  - `npm i @tanstack/react-query@5 zustand@4 clsx tailwind-merge zod`
  - `npm i react-vega vega vega-lite @tiptap/react @tiptap/starter-kit @tiptap/pm perfect-freehand`
  - **참고: `katex`는 설치하지 않는다.**
- [ ] **Step 2: cn 헬퍼 및 shadcn 컴포넌트 추가**
- [ ] **Step 3: Query Provider 및 전역 레이아웃 설정**
  - `web/app/providers.tsx`, 3-Section 레이아웃을 위한 `AppSidebar` 준비.
- [ ] **Step 4: 다크 테마 디자인 토큰 설정 (`globals.css`, `tailwind.config.ts`)**

---

## Task 3: orval 타입 클라이언트 자동생성

- [ ] **Step 1: 토큰 스토어 (`web/lib/auth.ts`)**
- [ ] **Step 2: mutator (`web/lib/api-client.ts`)**
- [ ] **Step 3: orval 설정 및 생성 실행**

---

## Task 4: 인증 — 로그인/회원가입 화면

- [ ] **Step 1: 세션 훅 (`web/hooks/useSession.ts`)**
- [ ] **Step 2: 로그인 화면 (`web/app/(auth)/login/page.tsx`)**
- [ ] **Step 3: AuthGuard (`web/components/auth/AuthGuard.tsx`)**

---

## Task 5: 🏠 홈 및 문제 탐색 화면

- [ ] **Step 1: 분류 3단계 그룹핑 훅/로직 작성** (`GET /subjects` 결과 활용).
- [ ] **Step 2: 공통 `SubjectSelect` 컴포넌트 작성 (수능/내신 -> 과목군 -> 세부과목)**.
- [ ] **Step 3: 검색 및 문제 리스트 화면** (`web/app/questions/page.tsx`).
- [ ] **Step 4: QuestionCard 컴포넌트** (누적 정답률 표시).

---

## Task 6: 문제집 생성 2-Track 관문 (`/workbook/create`)

- [ ] **Step 1: 3단 분류 선택기 UI**
- [ ] **Step 2: 하단 2-Track 카드 (AI 스마트 생성 / 직접 출제 에디터)**
- [ ] **Step 3: AI 생성 런타임 스켈레톤 및 폴링 로직**

---

## Task 7: 출제 스튜디오 (`/studio/editor`)

- [ ] **Step 1: QuestionViewer 및 Tiptap 에디터 바인딩**
- [ ] **Step 2: 미디어 업로드 처리 (클라이언트 이미지 크롭 -> Supabase)**
- [ ] **Step 3: 인라인 AI 오답 선지 재생성 기능 연동** (`POST /questions/:id/choices/regenerate`)
- [ ] **Step 4: 문제 발행 및 상태 처리**

---

## Task 8 & Task 9: (REMOVED) AI 시각화 및 KaTeX 렌더링 폐기

- AI 생성 SVG/Vega 차트 및 수식 렌더링 요구사항이 MVP 스펙에서 **삭제**되었습니다. (실행하지 않음)

---

## Task 10: SketchCanvas — 재사용 필기 컴포넌트

- [ ] **Step 1: 좌표 정규화 로직 작성 (`normalize.ts`)**
- [ ] **Step 2: SketchCanvas 컴포넌트 작성** (`perfect-freehand` 사용)

---

## Task 11: 모의고사 조립 화면 (`/exam/assemble`)

- [ ] **Step 1: 필터 UI (세부과목, 문제 유형, 난이도)**
- [ ] **Step 2: 세션 생성 연동** (`POST /workbooks/:id/start` 또는 `POST /exam-sessions`)

---

## Task 12: 응시 화면 — OMR + 타이머 + 캔버스

- [ ] **Step 1: Zustand 스토어 (`examStore.ts`)**
- [ ] **Step 2: 타이머 컴포넌트 및 OMR 시트**
- [ ] **Step 3: 응시 페이지 로직 (`/exam/[sessionId]/page.tsx`)**
  - 마스킹된 지문 노출, 필기 캔버스 연동, 제출 처리.

---

## Task 13: 채점 결과 화면 (`/exam/[sessionId]/result`)

- [ ] **Step 1: 결과 요약 페이지 컴포넌트 작성**
- [ ] **Step 2: 주관식 서술형 자기채점 토글 (O/X) `SelfGradeToggle` 연동** (`PUT /exam-sessions/questions/:sqId/self-grade`)

---

## Task 14: 문제 상세 허브 (`/questions/[id]`)

- [ ] **Step 1: 별점 및 체감난이도 평가 패널 (`ReviewPanel`)**
- [ ] **Step 2: Q&A 댓글/대댓글 트리 렌더링 (`CommentTree`)** - 핀 기능 제외
- [ ] **Step 3: 상세 페이지 조립**

---

## Task 15: 오답노트 통합 대시보드 (`/me/notes`)

- [ ] **Step 1: 통계 차트 (`react-vega`) 작성** (오답원인, 과목별 정적 차트).
- [ ] **Step 2: 오답 문항 리스트 및 오답노트 2.0 (텍스트 앵커 주석 시스템)**
  - `AnnotationLayer`, `AnnotationPopover` 구현.
  - 마우스 드래그 기반 텍스트 주석 및 메모 팝업.
- [ ] **Step 3: `@sidebar` Parallel Route 구조를 활용한 맥락 분리 렌더링**

---

## Task 16: 배포 및 네비게이션

- [ ] **Step 1: `AppSidebar` 3-Section 레이아웃 적용 및 라우팅 점검**
- [ ] **Step 2: Cloudflare Pages 배포 설정 (`@cloudflare/next-on-pages`)**
- [ ] **Step 3: 최종 골든패스 데모 리허설**
