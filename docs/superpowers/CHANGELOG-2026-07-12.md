# 작업 로그 — 2026-07-12

Q-Idea 세션 변경 요약. 백엔드(`src/`) + 프론트(`web/`). 아래 순서는 대략 시간순.

## 1. 인증/인프라 안정화

- **401 폭탄 수정** (`src/modules/auth/jwt.strategy.ts`) — TiDB Serverless가 유휴 커넥션을 끊으면 `validate()`의 매 요청 user 조회가 throw → passport-jwt가 401로 변환하던 문제. 커넥션 오류(P1017/P1001 등)면 `$connect` 재연결 후 1회 재시도, 그래도 실패면 401 아닌 503. 회귀 테스트 `jwt.strategy.spec.ts`.
- **TiDB keep-alive cron** (`src/prisma/prisma-keepalive.service.ts`) — `@nestjs/schedule` 도입, `@Cron('*/5 * * * *')` `SELECT 1`로 커넥션 풀 예열(콜드스타트 예방). 401 재시도(사후)와 짝을 이루는 사전 예방.
- **미인증 라우트 가드** (`web/components/auth/AuthGuard.tsx`) — 공개 경로(/, /intro, /login, /signup) 외 토큰 없으면 렌더 전에 `/login?callbackUrl=<원래주소>`로 이동 → 비회원 콘솔 401 원천 차단. `AuthForm`이 로그인 성공 시 callbackUrl로 복귀(내부 경로만, open redirect 방지). `apiFetch`/`streamAuthoringChat` 401 중앙 처리(`handleUnauthorized`) — 만료 토큰이면 토큰 클리어 + 재로그인.
- **CORS 실반영** (`src/main.ts`) — 그동안 `ALLOWED_ORIGINS`를 안 읽고 전체 허용하던 것을, 설정 시 목록 + `*.vercel.app`만 허용하도록 반영.

## 2. 대화형 출제 캔버스 (`/edit?workbookId=`)

멀티턴 AI 채팅 + 좌측 문제집 카드 캔버스. 스펙/계획: `docs/superpowers/{specs,plans}/2026-07-12-conversational-authoring-canvas*`.

- **백엔드**: `POST /ai-generations/chat` (SSE 스트리밍, tutor 패턴 각색). Redis 히스토리 `authoring:{workbookId}`, 레이트리밋 1시간 60회, 문자 상한 12000. 시스템 프롬프트가 산문 뒤 ` ```qidea-questions ` 펜스 블록(평문 문항 배열) 방출. 설정 힌트(questionType/ox/difficulty) 지원.
- **프론트**: `AuthoringCanvas`(좌 카드+저장) / `AuthoringChatPanel`(우 채팅) / `AuthoringCanvasCard`(카드). `web/lib/authoring-chat.ts`가 SSE 소비 + 블록 파싱(관대화: json태그·주석·트레일링콤마·잘린블록·타입변형 정규화).
- **기능**: 채팅 제안 미리보기(선지·정답·해설·지문) → 적용/교체, 카드 인라인 편집(발문·지문·해설 Tiptap, 선지 추가/삭제/정답), 유형 전환(객관식↔주관식), 배점, 선지별 해설 공개 토글, 지문 공유 표시+동반수정, 드래그&드롭 순서, 공개/비공개 토글, ✨AI 채팅 프리필, #키워드 태깅(find-or-create). 설정 패널(유형/수량/난이도)은 채팅 컬럼 내 입력창 위.
- **저장**: 지문은 `POST /passages` 생성·발행 후 passageId 연결(공유 지문 재사용). 문항 `createQuestion`+발행+`addQuestionToWorkbook`. 실패 시 서버 메시지 노출.

### 스트리밍 무응답 근본 버그 (중요)

Gemini `streamGenerateContent` SSE 프레임 구분자는 **CRLF(`\r\n\r\n`)** 인데 `streamChat`이 `\n\n`만 찾아 프레임 분리 영구 실패 → 델타 0개로 조용히 종료. 누적 버퍼 CRLF→LF 정규화로 수정(`gemini-llm.service.ts`), 회귀 테스트 `stream-chat.spec.ts`. **tutor 채팅도 같은 경로라 함께 고쳐짐.** 부수: thinking 모델(gemini-3) thought 파트 제외, 델타 0 스트림은 done 대신 error 프레임.

## 3. 풀이/결과 화면

- **지문 표시 버그** — 세션 조립(`exam-sessions.service.ts`)이 문항 select에 passage를 안 담아 풀이/결과 화면에 지문이 안 보이던 결함. `QuestionSnapshot.passage` 추가, 조립 시 `Passage.content` 복사. **새로 시작하는 세션부터 적용**(기존 세션 스냅샷은 이미 굳음).
- **2열 문제지 배치** — 풀이·결과 모드 중앙 정렬 + 2열 사이 hairline. 결과 카드에 `(정답률: NN%)` 배지(스냅샷 카운트, 표본 10+만). 스펙: `docs/superpowers/specs/2026-07-12-solve-page-exam-sheet-layout-design.md`.

## 4. UI/게이미피케이션

- **마일스톤 타이틀 과목 무관화** (`src/common/constants/xp.ts`) — '국어 입문자'→'자라나는 새싹'…'전설의 불사조'. seed/프론트 하드코딩 없음(파생).
- **유저 정보 위치** — /me는 사이드바 하단, 작성자(owner nickname)는 문제집 탐색 카드 안.
- **문제 탐색(/questions) nav 제거**, 문제집 카드 호버 피드백.

## 5. 전 페이지 모바일 반응형

`md`(768px) 미만만 재배치, 데스크톱 불변, 새 팔레트/폰트 없음. 사이드바→하단 탭바, /edit→세그먼트 탭(AI 스트리밍 신호점), 풀이 OMR→가로 스트립, 대시보드/오답노트(parallel route)/문항/문제집/스튜디오 에디터/Calculator/CartPanel 전부 스택·패딩·폭 반응형화.

## 검증 상태

- 백엔드 jest 117 통과, 양쪽 `tsc` 클린, `next build` 성공.
- 프로덕션 API 직접 재현(계정→문제집→문항→발행→담기 201), 스트리밍 SSE 정상 델타+블록 방출 확인.
- 브라우저: /workbook→/edit 캔버스 진입, AuthGuard 리다이렉트, 모바일 폭 DOM 전환 확인.

## 남은 작업 (미완/미확인)

1. **로컬 미푸시 커밋 3개** push — 사용자가 직접(`0195514d` #키워드, `af002acf`·`480a2497` 모바일).
2. **실기 확인** — QuestionEditor(studio) 모바일 키보드 시 채팅 입력창 가림 여부, 캔버스 저장 E2E.
3. **Railway env** — `ALLOWED_ORIGINS`에 프로덕션 도메인(`https://i-ea.vercel.app`) 추가 권장(현재 `*.vercel.app` 정규식으로 통과는 됨).
4. **지문 저장은 새 세션부터** — 기존 진행 세션엔 소급 안 됨.
5. **QuestionDetail.tsx** — 이미 `flex-col lg:flex-row`라 모바일 무난하나 정밀 점검은 안 함.
