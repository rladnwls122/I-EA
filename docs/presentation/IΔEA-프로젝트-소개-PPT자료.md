# IΔEA (Q-Idea) — 프로젝트 소개 PPT 자료

> **용도**: 발표·포트폴리오·기술 공유용 슬라이드 원고  
> **작성일**: 2026-07-13  
> **저장소**: [rladnwls122/I-EA](https://github.com/rladnwls122/I-EA)  
> **라이브 서비스**: [https://i-ea.vercel.app](https://i-ea.vercel.app)

---

## 슬라이드 1 — 표지

**IΔEA**  
AI 문제은행 · 모의고사 · 오답노트 플랫폼

- 한국 시험(수능·내신) 대비를 위한 **풀이 → 분석 → 복습** 학습 루프
- AI 기반 문항 출제 + 문제집 조립 + 실전형 응시 환경
- 백엔드 API(NestJS) + 프론트엔드(Next.js) 풀스택 프로젝트

**발표자**: _(이름 입력)_  
**날짜**: 2026년

---

## 슬라이드 2 — 왜 이 프로젝트인가?

### 문제

| Pain Point | 설명 |
|------------|------|
| **분산된 학습 자료** | 문제은행, 오답노트, AI 도구가 각각 분리되어 학습 흐름이 끊김 |
| **오답 원인 추적 부재** | "틀렸다"는 기록만 남고, *왜* 틀렸는지 체계적 축적이 어려움 |
| **출제 비용** | 양질의 문항·문제집 제작에 시간과 전문성이 필요 |
| **채점 신뢰성** | 원본 문항이 수정되면 과거 응시 기록과 채점 근거가 불일치 |

### 솔루션

> **하나의 플랫폼**에서 문항 탐색·문제집 조립·응시·오답 분석·AI 재출제까지 **닫힌 루프(Closed Loop)** 제공

---

## 슬라이드 3 — 핵심 학습 루프

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. 골라 담아  │ ──▶ │ 2. 틀린 이유  │ ──▶ │ 3. AI와 다시  │
│     풀기      │     │    남기기     │     │    만나기     │
└─────────────┘     └─────────────┘     └─────────────┘
   문제집 조립          오답노트 주석         AI 문항 재생성
   모의고사 응시        원인 태그·메모        약점 유형 보완
```

1. **골라 담아 풀기** — 과목·개념·난이도로 문항을 골라 문제집으로 묶고 응시
2. **틀린 이유 남기기** — 개념부족·실수·시간부족 등 원인 태그 + 텍스트 주석
3. **AI와 다시 만나기** — 약한 유형을 AI가 새 문항으로 되돌려주며 루프 반복

> 출처: `web/app/intro/page.tsx` — 서비스 랜딩 페이지의 핵심 메시지

---

## 슬라이드 4 — 타겟 사용자

| 역할 | 설명 | 주요 기능 |
|------|------|-----------|
| **수험생 (CONSUMER)** | 문제 풀이·복습 중심 | 문제집 탐색, 응시, 오답노트, XP·스트릭 |
| **출제자 (CREATOR)** | 문항·문제집 제작 | AI 자동생성, 대화형 출제 캔버스, 발행 |
| **관리자 (ADMIN)** | 마스터 데이터 관리 | 과목 분류, 태그, 시스템 설정 |

---

## 슬라이드 5 — 주요 기능 한눈에

| 영역 | 기능 |
|------|------|
| **문항 관리** | 객관식/주관식, ProseMirror 리치 텍스트, 검색·통계·평가 |
| **문제집** | 탐색, 포크, Pick & Mix 장바구니, 바로풀기 |
| **AI 출제** | 비동기 일괄 생성(BullMQ) + 대화형 출제 캔버스(SSE) |
| **모의고사** | 세션 조립, OMR 패널, 필기 오버레이, 계산기 |
| **채점** | 객관식·단답 자동채점, 서술형 자기채점 |
| **오답노트 2.0** | 텍스트 앵커 하이라이트/밑줄 + 오답원인 태그 |
| **AI 튜터** | SSE 스트리밍 대화, Redis 히스토리 |
| **게이미피케이션** | XP·레벨·스트릭·코인·상자·상점 |

---

## 슬라이드 6 — 기술 스택

### Backend (`src/`)

| 계층 | 기술 |
|------|------|
| 프레임워크 | **NestJS 10** (TypeScript) |
| ORM / DB | **Prisma 5** → MySQL (프로덕션: TiDB Serverless) |
| 비동기 큐 | **BullMQ** + Redis |
| 인증 | JWT + Passport, bcrypt |
| LLM | **Google Gemini** (단일 제공자) |
| 미디어 | AWS S3 Presigned POST |
| API 문서 | Swagger (`/api/docs`) |

### Frontend (`web/`)

| 계층 | 기술 |
|------|------|
| 프레임워크 | **Next.js 14** (App Router) |
| UI | React 18, Tailwind CSS, shadcn/ui |
| 상태 | TanStack Query, Zustand |
| 에디터 | Tiptap / ProseMirror |
| 차트 | Vega / Vega-Lite (SSR 비활성) |

### Infrastructure

| 구성 | 배포 |
|------|------|
| API | **Railway** |
| Web | **Vercel** (`i-ea.vercel.app`) |
| DB | TiDB / MySQL |
| Cache/Queue | Redis (Aiven 등) |
| Storage | AWS S3 |

---

## 슬라이드 7 — 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                     Client (Browser)                          │
│              Next.js 14 · React · Tailwind                    │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS / SSE
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   NestJS API (Railway)                        │
│  auth · questions · workbooks · exam-sessions · ai-generation │
│  annotations · me · tutor · shop · loot-boxes · media         │
└──────┬──────────────┬──────────────┬──────────────┬──────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
   MySQL/TiDB      Redis          Gemini API      AWS S3
   (Prisma)     (BullMQ·캐시)    (LLM 호출)    (이미지)
```

**통신 방식**
- REST API: 대부분의 CRUD·조회
- SSE: AI 튜터, 대화형 출제 채팅
- 폴링: AI 일괄 생성 상태 (`PENDING → COMPLETED`)

---

## 슬라이드 8 — 백엔드 모듈 구성

| 모듈 | 담당 | 핵심 API |
|------|------|----------|
| `auth` | 인증/인가 | `POST /auth/register`, `/login`, `GET /auth/me` |
| `catalog` | 분류/태그 | `GET /subjects`, `GET/POST /tags` |
| `questions` | 문항 CRUD | `GET /questions`, AI 선지 재생성 |
| `passages` | 지문 관리 | `POST /passages`, 발행 워크플로 |
| `workbooks` | 문제집 | 탐색, 포크, Pick & Mix, 바로풀기 |
| `exam-sessions` | 응시/채점 | 세션 조립, 답안, 자기채점, AI 힌트 |
| `ai-generation` | AI 생성 | 비동기 생성 + 대화형 SSE 출제 |
| `annotations` | 오답노트 | 텍스트 주석 CRUD |
| `me` | 개인화 | 풀이 기록, 통합 오답노트/통계 |
| `tutor` | AI 튜터 | SSE 스트리밍 채팅 |
| `shop` / `loot-boxes` | 재화/보상 | 코인, 상자, 상점 |

> 전역 `JwtAuthGuard` — 모든 API 기본 인증, `@Public()` 예외만 공개

---

## 슬라이드 9 — 데이터 모델 핵심

### 3단 분류 체계 (단원 트리 없음)

```
시험 (examType)  →  대분류 (examCategory)  →  소분류 (name)
   수능                    국어                    문학
   내신                    수학                    미적분
```

### 주요 엔티티

| 모델 | 역할 |
|------|------|
| `User` | XP, 레벨, 스트릭, 코인, 힌트 무료 카운트 |
| `Question` | 객관식/주관식, ProseMirror JSON, `correctAnswerText` |
| `Workbook` | 문제집, M:N 문항 연결, 포크/Pick 출처 |
| `ExamSession` | 응시 세션, 스냅샷·마스킹·채점 |
| `UserQuestionAnnotation` | 텍스트 앵커 오답 주석 |
| `AiGeneration` | 비동기 AI 생성 잡 상태 |

---

## 슬라이드 10 — 핵심 설계 원칙 (1)

### 1. 문항 스냅샷 (Snapshot)

- 세션 조립 시 문항 전체를 `exam_session_questions.snapshot`에 **복사**
- 원본 문항이 이후 수정돼도 **과거 채점 근거 고정**
- 지문(passage)도 스냅샷에 포함 (2026-07-12 개선)

### 2. 정답 마스킹 (Masking)

- `IN_PROGRESS` 상태 조회 시:
  - 선지 `isCorrect` 숨김
  - 주관식 `correctAnswerText` 숨김
  - 해설 숨김
- 제출(`SUBMITTED`) 후에만 정답·해설 공개

### 3. ProseMirror 일원화

- LLM은 **평문만** 출력
- `prosemirror.util.ts`가 ProseMirror JSON으로 조립
- 저장 포맷 안정성 + 검색용 `search_text` 캐시

---

## 슬라이드 11 — 핵심 설계 원칙 (2)

### 채점 시스템

| 유형 | 방식 |
|------|------|
| 객관식 | 정확 일치 (부분 점수 없음) |
| 주관식 단답 | 정규화 문자열 비교 → 자동채점 |
| 주관식 서술형 | `correctAnswerText` 없음 → **자기채점** (`self-grade`) |

### AI 생성 (비동기)

```
POST /ai-generations
    → PENDING row + BullMQ enqueue → 202 즉시 반환
    → Processor: 멱등 처리, 성공 시 passage+questions 트랜잭션
    → GET /ai-generations/:id 폴링
```

- 실패 시 BullMQ 재시도 → 최종 `FAILED`
- Gemini 단일 LLM 제공자

---

## 슬라이드 12 — AI 기능 상세

### 비동기 일괄 생성
- 조건(과목·난이도·유형·태그) 기반 문항 자동 생성
- BullMQ 큐 + Redis, 프로덕션 안정성

### 대화형 출제 캔버스 (`/edit`)
- `POST /ai-generations/chat` — SSE 스트리밍
- 좌측: 문제집 카드 캔버스 (드래그 정렬, 인라인 편집)
- 우측: AI 채팅 (미리보기 → 적용/교체)
- Redis 히스토리 `authoring:{workbookId}`, 레이트리밋

### AI 튜터
- `POST /tutor/chat` — SSE 스트리밍
- 문항 맥락 기반 학습 도우미

### 응시 중 AI 힌트 (설계 완료)
- 풀이 화면에서 즉석 힌트 생성
- 하루 무료 횟수 + 코인 소비 게이팅

---

## 슬라이드 13 — 오답노트 2.0

### 기존 vs 개선

| 기존 | 오답노트 2.0 |
|------|-------------|
| 문항당 단일 메모 | **문항당 다중 텍스트 주석** |
| 자유 텍스트만 | 하이라이트/밑줄 + **오답원인 태그** |
| 통계 없음 | `bySubject` / `byType` / `byReason` 집계 |

### 주석(Annotation) 구조

- `target` + `selectionRange` — 문항 내 텍스트 앵커
- `markStyle` + `color` — 하이라이트/밑줄
- `reasonCode` — CONCEPT / MISTAKE / TIME / OTHER
- `memoText` — 자유 메모

### API
- `GET/POST /questions/:id/annotations`
- `GET /me/notes` — 오답 문항 + 주석 통합 조회

---

## 슬라이드 14 — 프론트엔드 페이지 구조

| 경로 | 역할 |
|------|------|
| `/` | 홈 대시보드 (비로그인 → `/intro`) |
| `/intro` | 마케팅 랜딩 |
| `/workbook` | 공개 문제집 탐색 |
| `/workbook/mine` | 내 문제집 관리 |
| `/workbook/create` | 문제집 생성 |
| `/edit?workbookId=` | **대화형 AI 출제 캔버스** |
| `/exam-sessions/[id]` | 풀이·결과 (OMR, 필기, 계산기) |
| `/notes` | 오답노트 대시보드 |
| `/notes/[questionId]` | 문항별 주석 상세 |
| `/questions/[id]` | 문항 상세·댓글·평가 |
| `/me` | 프로필·XP·스트릭 |
| `/shop` | 코인 상점 |

### 레이아웃
- 데스크톱: 좌측 64px 사이드바
- 모바일: 하단 탭바 (`md` 브레이크포인트)

---

## 슬라이드 15 — 게이미피케이션

### XP & 성장
- 정답·복습·스트릭으로 XP 적립
- 레벨 = XP에서 파생 (`levelForXp`)
- 마일스톤 타이틀 ("자라나는 새싹" → "전설의 불사조")

### 스트릭
- 일 단위 연속 학습 카운트
- 7일/30일 달성 시 **XP 2배 부스터**

### 재화 (코인·상자·상점)
- 풀이 보상 → 상자 드롭 → 코인 획득
- 상점에서 XP 부스터, 코스메틱(타이틀·닉네임 색상) 구매
- XP와 코인은 **별개 축** (랭킹/리그 없음 — 개인 성장 중심)

---

## 슬라이드 16 — 배포 & 운영

### Backend (Railway)
```bash
npm run start:railway
# → prisma db push && node dist/main.js
```
- 프로덕션 DB: `db push` (마이그레이션 아님)
- CORS: `ALLOWED_ORIGINS` + `*.vercel.app`

### Frontend (Vercel)
- URL: `https://i-ea.vercel.app`
- `web/` 디렉터리 별도 배포

### 환경 변수
- `DATABASE_URL`, `REDIS_*`, `JWT_SECRET`
- `GEMINI_API_KEY`, AWS S3 키

### 안정화 (2026-07-12)
- TiDB 유휴 연결 401 → 503 + 재연결
- keep-alive cron (5분 `SELECT 1`)
- 프론트 `AuthGuard` + 401 중앙 처리

---

## 슬라이드 17 — 최근 업데이트 (2026-07-12)

| 영역 | 내용 |
|------|------|
| **대화형 출제** | `/edit` AI 캔버스 — SSE 채팅, 카드 드래그, #키워드 태깅 |
| **스트리밍 버그 수정** | Gemini CRLF 프레임 분리 → tutor·출제 채팅 정상화 |
| **풀이 화면** | 지문 스냅샷 포함, 2열 문제지 레이아웃 |
| **모바일** | 전 페이지 반응형 (`md` 브레이크포인트) |
| **UI 리디자인** | 다크 precision instrument, emerald primary 토큰 |
| **인증** | AuthGuard, CORS 실반영, TiDB 연결 안정화 |

### 검증
- 백엔드 Jest **117 통과**
- `tsc` 클린, `next build` 성공
- 프로덕션 API E2E + SSE 스트리밍 확인

---

## 슬라이드 18 — 차별화 포인트

1. **닫힌 학습 루프** — 풀이 → 오답 원인 → AI 재출제가 하나의 플랫폼
2. **스냅샷 채점** — 문항 수정과 무관한 채점 신뢰성
3. **텍스트 앵커 오답노트** — "어디를" 틀렸는지 문장 단위 기록
4. **대화형 AI 출제** — 채팅으로 문항을 함께 만들고 즉시 문제집에 반영
5. **ProseMirror 일원화** — LLM 출력과 저장 포맷 분리로 안정성 확보
6. **미니멀 게이미피케이션** — 랭킹 없이 개인 성장만 추적

---

## 슬라이드 19 — 기술적 도전 & 해결

| 도전 | 해결 |
|------|------|
| TiDB Serverless 유휴 연결 끊김 | keep-alive cron + JWT validate 재연결 + 503 |
| Gemini SSE CRLF 프레임 | 버퍼 CRLF→LF 정규화, 회귀 테스트 |
| Vega SSR canvas 오류 | `next/dynamic` + `ssr: false` 이중 가드 |
| ProseMirror JSON 렌더링 | `extractPlainText` 유틸 + 전용 렌더러 |
| API/프론트 포트 충돌 | dev 시 포트 분리 운영 |
| Mock/API 혼재 | `lib/types.ts` SSOT, `lib/api.ts` 우선 사용 |

---

## 슬라이드 20 — 향후 로드맵

| 우선순위 | 기능 | 상태 |
|----------|------|------|
| 높음 | 응시 중 AI 힌트 | 설계 승인, 구현 예정 |
| 중간 | 상점·코인 시스템 고도화 | 스키마 반영, UI 진행 중 |
| 중간 | Pick & Mix 장바구니 UX | 설계 완료 |
| 낮음 | 홈 대시보드 개선 | 설계 완료 |
| 지속 | Mock → Real API 전환 | 점진적 마이그레이션 |

---

## 슬라이드 21 — 프로젝트 규모

| 지표 | 수치 |
|------|------|
| 백엔드 모듈 | 15개 NestJS 모듈 |
| Prisma 모델 | 20+ 엔티티 |
| 프론트 페이지 | 17+ 라우트 |
| API 엔드포인트 | 50+ (Swagger 문서화) |
| 테스트 | Jest 117 통과 |
| 설계 문서 | `docs/superpowers/` 20+ 스펙/플랜 |

---

## 슬라이드 22 — 데모 시나리오 (라이브 시연용)

1. **회원가입/로그인** → `https://i-ea.vercel.app`
2. **문제집 탐색** → `/workbook`에서 공개 문제집 선택
3. **바로풀기** → 응시 세션 시작, OMR·필기 사용
4. **제출 & 결과** → 자동채점 결과, 정답률 배지
5. **오답노트** → `/notes`에서 오답 문항 + 주석 확인
6. **AI 출제** → `/edit`에서 대화형 캔버스 체험
7. **프로필** → `/me`에서 XP·스트릭·마일스톤

---

## 슬라이드 23 — Q&A / 마무리

**IΔEA** — AI로 문제를 만들고, 풀고, 틀린 이유를 남기고, 다시 만나는  
**한국 시험 대비 올인원 학습 플랫폼**

### 링크
- **서비스**: [https://i-ea.vercel.app](https://i-ea.vercel.app)
- **GitHub**: [https://github.com/rladnwls122/I-EA](https://github.com/rladnwls122/I-EA)
- **API 문서**: `/api/docs` (Swagger)

### 문의
- _(연락처 입력)_

---

## 부록 A — PPT 제작 팁

### 슬라이드별 추천 비주얼

| 슬라이드 | 추천 이미지/다이어그램 |
|----------|----------------------|
| 3 (학습 루프) | 3단계 순환 다이어그램 (intro 페이지 스크린샷) |
| 7 (아키텍처) | 시스템 구성도 (본 문서 ASCII 다이어그램 활용) |
| 10-11 (설계) | 스냅샷/마스킹 플로우차트 |
| 12 (AI) | `/edit` 캔버스 스크린샷 |
| 13 (오답노트) | 주석 UI 스크린샷 |
| 14 (프론트) | 사이트맵 트리 |
| 22 (데모) | 실제 서비스 스크린샷 5~7장 |

### 발표 시간 가이드

| 분량 | 권장 슬라이드 |
|------|--------------|
| 5분 (피치) | 1, 2, 3, 5, 18, 23 |
| 10분 (기술 소개) | 1–7, 10, 12, 18, 23 |
| 20분 (풀 덱) | 전체 (1–23) |
| 30분+ (기술 심화) | 전체 + 부록 + 라이브 데모 |

### 디자인 톤
- 서비스 UI와 일치: **다크 배경 + emerald 액센트**
- 폰트: Pretendard (본문), Geist Mono (숫자/통계)
- 아이콘: Lucide React 스타일

---

## 부록 B — 참고 문서 인덱스

| 문서 | 경로 |
|------|------|
| 프로젝트 README | `README.md` |
| 개발 가이드 | `AGENTS.md` |
| 프론트 가이드 | `web/WEB_GUIDE.md` |
| 로컬 테스트 | `LOCAL_TEST_GUIDE.md` |
| DB 스키마 | `prisma/schema.prisma` |
| API 인벤토리 | `docs/superpowers/plans/2026-07-08-qidea-api-inventory.md` |
| 변경 로그 | `docs/superpowers/CHANGELOG-2026-07-12.md` |
| UI 토큰 | `docs/superpowers/specs/2026-07-12-ui-redesign-tokens.md` |

---

*이 문서는 코드베이스 읽기 전용 분석을 기반으로 작성되었습니다. 발표 시 스크린샷·데모는 최신 프로덕션 환경에서 캡처하는 것을 권장합니다.*
