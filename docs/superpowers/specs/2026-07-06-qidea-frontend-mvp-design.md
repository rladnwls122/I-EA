# Q-Idea 프론트엔드 — 1주 E2E 데모 설계안

- 작성일: 2026-07-06
- 대상: `C:\Users\kryuk\dev` (Q-Idea / IΔEA)
- 목표: **이미 배포된 NestJS 백엔드 위에, 1주 안에 AI 보조로 프론트엔드 E2E 데모를 완성**
- 완성 정의: 출제자 → 응시자 골든패스 하나를 최소기능으로 관통하고, 수험생 생태계 기능(리뷰·댓글·메모·필기·오답노트)을 얕게라도 시연 가능한 상태

---

## 1. 배경 & 현 상태

- **백엔드**: NestJS 10 + Prisma(MySQL) + BullMQ(Redis). 11개 모듈(auth, ai-generation, questions, passages, exam-sessions, media, reviews, comments, memos, variants, catalog) 구현 완료, Railway 배포, Swagger `/api/docs` 존재. **거의 완성 상태 — 재사용이 원칙.**
- **프론트엔드**: 없음. standalone HTML 프로토타입 2개(출제 스튜디오, 문제 상세)만 존재.
- **AI 생성**: Gemini/Anthropic LLM 서비스로 지문+문항 비동기 생성(BullMQ). 현 LLM 출력계약(`llm.types.ts`)은 **평문 stem/choices/explanation만** 생산 — 시각화 필드 없음.
- **콘텐츠 포맷**: `stem/choices/explanation`은 Tiptap/ProseMirror JSON. 서버 `prosemirror.util`이 조립·평문추출 담당.
- **인증**: 비밀번호 컬럼 없음. 외부 IdP로 검증된 email을 받는 프로비저닝 방식(`POST /auth/login`).
- **디자인 스크래치**: Figma에 로그인/회원가입, 문제 검색결과 조회, 상세 결과 조회 3화면 존재. (파일: `llu0XN63If2yDAb8Vk306L`)

## 2. 확정 결정 사항 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 1주 목표 | 얇은 E2E 데모 (양 페르소나 관통, 각 기능 얕게) |
| 시각화 자료 | AI 생성 + 안전 렌더 (저작 UI 없음) |
| 스튜디오 편집 | 경량 인라인 편집 |
| 디자인 언어 | shadcn/ui 기반 신규 디자인 시스템 |
| 실행 전략 | A안 — 수직 슬라이스 + 타입 클라이언트(orval) |
| 펜 필기 | 경량 구현. 재사용 컴포넌트 1개로 메모+응시 양쪽 |
| 변형문제 | UI 셸 + 기존 엔드포인트 연결 |
| 핀 | UI만 |
| 오답노트 | 그래프+리스트 + 백엔드 읽기 엔드포인트 2개 추가 |
| 커뮤니티 | 리뷰·댓글·대댓글·메모 전부 작성+읽기 포함 |

## 3. 아키텍처 & 스택

```
[Next.js App Router / Vercel]
   ├─ RSC: 목록·상세 데이터 페칭 (서버에서 REST 호출)
   ├─ Client Components: 스튜디오 편집, 응시(OMR·타이머·필기), 캔버스
   ├─ Route Handler /api/ai/visualize ──(Gemini, 키 은닉)──► Vega-Lite/SVG 스펙 반환
   └─ orval 타입 클라이언트 (Swagger 자동생성) ──REST /api──► [NestJS API / Railway]
```

- **프레임워크**: Next.js(App Router) + TypeScript strict
- **스타일**: Tailwind CSS + shadcn/ui + Radix. `cn`(clsx+tailwind-merge)
- **서버상태**: TanStack Query (React Query)
- **클라이언트상태**: Zustand (응시 세션: OMR 답안·타이머·현재 문항)
- **타입 안전**: `orval`로 Swagger → 훅·타입·zod 스키마 자동생성 (수기 타이핑 0)
- **수식**: KaTeX
- **시각화**: react-vega + vega-lite, SVG는 DOMPurify sanitize
- **에디터**: Tiptap (경량 인라인 편집, read/write 최소 확장셋)
- **필기**: perfect-freehand
- **패키지매니저/툴**: pnpm, ESLint, Prettier
- **배포**: 프론트=Vercel, 백엔드=기존 Railway

### 3.1 디렉터리 구조 (CLAUDE.md 규약 준수)

```
app/
  (auth)/login/           로그인
  (auth)/signup/          회원가입
  questions/              문제 검색결과 조회 (필터·검색 리스트)
  questions/[id]/         문제 상세 허브
  create/                 AI 생성 시작 폼
  studio/[genId]/         출제 스튜디오 (렌더+경량편집+발행+변형셸)
  exam/assemble/          모의고사 조립
  exam/[sessionId]/       응시 (OMR·타이머·필기)
  exam/[sessionId]/result/  채점 결과
  me/notes/               오답노트·풀이기록
components/
  ui/        shadcn 프리미티브
  editor/    Tiptap 경량 에디터 + 렌더러
  viz/       VizRenderer (Vega/SVG/KaTeX)
  exam/      OMR 시트, 타이머, 문항 뷰어
  community/ 리뷰·댓글트리·메모
  canvas/    SketchCanvas (재사용)
hooks/       orval 생성 훅 + 커스텀 훅
lib/         api 클라이언트, auth, cn
types/       공유 타입
```

## 4. 화면별 명세 (골든패스 순)

1. **로그인 / 회원가입** — Figma 참조. email(+nickname) 입력 → `POST /auth/login`(프로비저닝) → JWT 저장. "데모 출제자 / 데모 응시자" 퀵버튼.
2. **문제 검색결과 조회** (`/questions`) — Figma 참조. `GET /questions`(필터·검색: unit/난이도/유형/키워드) 리스트. 카드 → 상세 이동. 생태계 발견성 진입점.
3. **AI 생성 시작** (`/create`) — 과목·단원 트리(`GET /subjects/:id/units`) 선택, 프롬프트·난이도·문항수·지문포함·유형 입력 → `POST /ai-generations`(202).
4. **생성 진행/폴링** — `GET /ai-generations/:id` 상태 폴링(PENDING→COMPLETED). 완료 시 스튜디오 이동.
5. **출제 스튜디오** (`/studio/[genId]`) — 지문+문항 렌더. **경량 인라인 편집**(발문·선지·해설 텍스트, 정답 토글, 난이도, 문항 삭제) → `PATCH /questions/:id`. 시각화 렌더. **변형문제 UI 셸**(`GET/POST /questions/:id/variants`). `POST /questions/:id/publish`.
6. **모의고사 조립** (`/exam/assemble`) — 과목+필터 → `POST /exam-sessions`(문항 스냅샷).
7. **응시** (`/exam/[sessionId]`) — 문항 뷰어 + OMR 답안(`PUT /exam-sessions/questions/:id/answer`) + 타이머 + **문항 필기(SketchCanvas → annotations)**. 진행 중 정답 마스킹 유지.
8. **채점 결과** (`/exam/[sessionId]/result`) — `POST /exam-sessions/:id/submit` 후 점수·문항별 정오·해설·정답률.
9. **문제 상세 허브** (`/questions/[id]`) — Figma 참조. 해설 + 정답률 + **별점 리뷰**(`PUT /questions/:id/reviews`) + **댓글·대댓글**(`GET/POST /questions/:id/comments`, `parentCommentId`) + **개인메모 텍스트+캔버스**(`PUT /questions/:id/memo`, `memos.canvas`) + **핀 UI**(버튼 배치).
10. **오답노트·풀이기록** (`/me/notes`) — 단원·유형별 오답비율 그래프(VizRenderer 재사용) + 오답 문항 리스트 → 상세(재풀이·변형) 링크.

## 5. 시각화 — 가능여부 & 우회 설계

- **직접 저작 UI는 v1에서 만들지 않음.** 대신 **AI 생성 + 안전 렌더**.
- **생성**: Route Handler `/api/ai/visualize`가 문항 컨텍스트를 받아 Gemini에 **Vega-Lite 스펙(JSON)** 또는 **제약된 inline SVG**를 요청. Gemini 키는 서버사이드 은닉.
- **검증**: 반환 스펙을 스키마 검증(zod). 허용 형태만 통과.
- **렌더 (`components/viz/VizRenderer`)**:
  - Vega-Lite → `react-vega`
  - SVG → `DOMPurify.sanitize` 후 삽입
  - 수식 → KaTeX
  - **임의 JS(D3/Plotly 코드) 실행 금지** — XSS 차단.
- **저장**: 기존 `MediaAsset`(assetType `GRAPH_CODE` sourceCode=스펙 / `SVG`)에 연결. 데모 초기엔 문항 metadata 인라인 보관도 허용.
- **데모 이후 정식화**: 이 스펙 생성을 백엔드 BullMQ 파이프라인 + `LlmQuestion.visual` 필드로 이관(향후 B안).

## 6. 백엔드 작업 (최소, 의도적 추가 1건)

기존 API 재사용이 원칙. 필요한 것만:

1. **CORS** — Vercel 도메인 허용 (`main.ts`).
2. **데모 시드** — CREATOR+CONSUMER 롤 보유 유저 시드, 로그인 프로비저닝 동작 확인.
3. **빌드/배포 검증** — README가 `tsc` 미검증 명시. `pnpm build` 통과 확인.
4. **`/me` 읽기 엔드포인트 2개 (의도적 추가, 읽기 전용)**:
   ```
   GET /me/exam-sessions   제출된 내 세션 목록 (풀이기록)
   GET /me/wrong-notes     오답 집계: unit·questionType별 groupBy
       ← exam_session_answers(isCorrect=false) JOIN questions(primaryUnitId, questionType)
   ```
   Prisma `groupBy` 쿼리. `me`(또는 stats) 모듈 1개. `WHERE/JOIN` 컬럼 인덱스 확인.
5. **(선택)** 시각화 asset을 media 엔드포인트로 저장.

## 7. 데이터 흐름 핵심

- **인증**: 로그인 → JWT를 클라이언트 저장 → orval 클라이언트가 `Authorization: Bearer` 자동 첨부. 전역 `JwtAuthGuard`, `@Public()` 예외.
- **생성 비동기**: 생성 요청은 202 즉시 응답 → 프론트 폴링. 요청 스레드가 LLM 대기 안 함.
- **문항 스냅샷**: 세션 조립 시 문제를 `exam_session_questions.snapshot`에 보존 — 채점 근거 고정.
- **정답 마스킹**: IN_PROGRESS 세션 조회 시 `isCorrect`·빈칸정답·해설 숨김. 결과 화면에서만 노출.
- **필기 스키마 공유**: `<SketchCanvas>`는 정규화 좌표(0~1) stroke 스키마 하나로 `memos.canvas`와 `answers.annotations` 양쪽 저장/재생.

## 8. 컴포넌트 경계 (재사용 단위)

- `VizRenderer` — 입력: 시각화 스펙. 출력: 안전 렌더. 내부(vega/svg/katex 분기) 격리.
- `SketchCanvas` — 입력: stroke JSON + onChange. 메모/응시 공용. 저장 위치는 부모가 결정.
- `CommentTree` — 재귀 렌더 + 답글(부모ID 세팅). depth 캡 2~3.
- `QuestionViewer` — Tiptap JSON + 시각화 + 수식 렌더 (읽기). 스튜디오는 편집 모드 토글.
- `OmrSheet` — 답안 상태(Zustand) 바인딩, 문항 이동.
- `WrongNoteChart` — VizRenderer 재사용, `/me/wrong-notes` 데이터 바인딩.

## 9. 테스트 & 검증

- 데모 성격상 풀 테스트 스위트는 비목표. **골든패스 스모크 1개**(Playwright, stretch): 로그인 → 생성 → 발행 → 조립 → 응시 → 채점.
- 각 Day 종료 시 해당 화면 수동 E2E 확인.
- 백엔드 `/me` 엔드포인트는 Prisma 쿼리 유닛 검증.

## 10. 1주 일정

| Day | 내용 |
|---|---|
| D1 | 스캐폴딩·orval·shadcn·인증 셋업 / **로그인·회원가입(Figma)** / 백엔드 CORS·시드·빌드검증·`/me` 2개 |
| D2 | **문제 검색결과 조회(Figma)** + 카탈로그 트리 + AI 생성폼·폴링 |
| D3 | 출제 스튜디오(렌더+경량편집) + 발행 + 변형 UI 셸 |
| D4 | 시각화 Route Handler + `VizRenderer`(Vega/SVG/KaTeX) + `SketchCanvas` |
| D5 | 모의고사 조립 + 응시(OMR·타이머·문항필기) |
| D6 | 채점 결과·정답률 + **문제상세 허브(Figma)**: 리뷰·댓글·대댓글·메모·캔버스·핀UI |
| D7 | **오답노트 그래프** + 디자인 폴리시·반응형·버그픽스·배포·데모 리허설 |

## 11. 리스크 & 컷라인

- **최대 리스크**: D7 오답노트가 유일 압박 지점. 밀리면 그래프 먼저, 리스트는 축소.
- **시각화 품질**: Gemini 스펙 생성 불안정 가능 → 스키마 검증 실패 시 폴백(텍스트 문항으로 표시).
- **Figma 접근**: MCP Starter 호출 한도 존재. 구현 시 화면별로 `get_design_context` 아껴 사용, 한도 리셋/업그레이드 활용.
- **백엔드 실행 미검증**: 로컬 Node 환경에서 `build` 최종 확인 필요.
- **컷라인**: 없음(전부 포함). 압박 시 순서 — 핀 배선 > 대댓글 depth > 오답 리스트 상세.
- **명시적 비목표**: Tiptap 풀에디터, 시각화 저작 UI, 소셜 로그인 검증 실물, 풀 테스트 커버리지.

## 12. 데모 스토리라인 (리허설용)

출제자 로그인 → 단원 선택·AI 생성 → 스튜디오에서 시각화 확인·문구 손질·발행 → (응시자 전환) 검색결과에서 문항 탐색 → 모의고사 조립 → OMR 응시·수식 필기 → 제출·즉시 채점·정답률 → 문제상세에서 리뷰·댓글·메모 → 오답노트 그래프로 약점 단원 확인 → 변형문제로 재도전.
