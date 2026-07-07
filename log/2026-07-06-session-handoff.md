# Q-Idea 세션 핸드오프 — 2026-07-06

내일 이어서 개발하기 위한 상태 스냅샷. 브레인스토밍 → 스펙 → 구현계획 → 백엔드 검증까지 완료. 프론트는 스캐폴딩 착수 상태에서 보류.

## 1. 산출물 문서 (경로)

- 스펙: `docs/superpowers/specs/2026-07-06-qidea-frontend-mvp-design.md`
- 구현계획(16 태스크): `docs/superpowers/plans/2026-07-06-qidea-frontend-mvp.md`
- 진행 ledger: `.superpowers/sdd/progress.md`
- 태스크 브리프/리포트: `.superpowers/sdd/task-*-brief.md`, `task-*-report.md`

## 2. 확정된 방향 (브레인스토밍 결론)

- **목표**: 기존 NestJS 백엔드 위 1주 E2E 데모 프론트엔드.
- **스코프**: 출제자→응시자 골든패스 + 수험생 생태계(리뷰·댓글·대댓글·메모·펜필기·오답노트·AI시각화).
- **편집**: 경량 인라인. **시각화**: AI 생성 + 안전 렌더(Vega-Lite/sanitize SVG, 임의 JS 금지).
- **스택**: Next.js14(App Router) + Tailwind + shadcn/ui + TanStack Query + Zustand + KaTeX + react-vega + DOMPurify + Tiptap + perfect-freehand.
- **배포**: 프론트=**Cloudflare Pages/Workers**(`@cloudflare/next-on-pages`, Route Handler는 `runtime='edge'`). 백엔드=Node 호스트(Railway). DB=**TiDB**(MySQL 호환). Redis=**Aiven**.
- **패키지매니저**: npm (pnpm 이 환경 미가용).

## 3. 완료 & 검증 상태

| 태스크 | 상태 | 검증 |
|---|---|---|
| Task 0: 백엔드 CORS + 데모 시드 | ✅ 완료 | `npm run build` 통과(최초 tsc 검증), seed **TiDB에 라이브 실행됨**(`seed done`) |
| Task 1: `/me/exam-sessions`, `/me/wrong-notes` | ✅ 완료·리뷰 승인 | jest RED→GREEN + **라이브 200 검증** |
| Task 2: Next 스캐폴딩 | ⚠️ 착수·보류 | 커밋 `8d674765` 존재(부분). API 연결오류로 중단, 내일 재개 |
| Task 3~16 | ⬜ 대기 | 프론트 나머지 |

### 라이브 백엔드 검증 결과 (TiDB 연결)
- `POST /api/auth/login` (creator@demo.io / consumer@demo.io) → 200, JWT 발급, seed 유저 반환.
- `GET /api/questions?status=PUBLISHED` → 200, seed 문항 5개.
- `GET /api/me/wrong-notes` → 200 `{"byUnit":[],"byType":[],"wrongQuestions":[]}`.
- `GET /api/me/exam-sessions` → 200 `[]`.
- 상세: `log/backend-live-verification.md`

## 4. 알려진 이슈 (내일 처리)

- **🔴 Aiven Redis 엔드포인트 오류**: 준 host:port(`...aivencloud.com:26252`)가 **Redis 프로토콜이 아니라 HTTP를 반환**(`got "H" as reply type byte` = HTTP 400). TLS 명시해도 동일. → Aiven 콘솔에서 실제 Valkey/Redis 서비스의 `rediss://` 접속정보 재확인 필요. **영향 범위: BullMQ AI 문항생성 큐만.** 나머지(auth·questions·exam·me·커뮤니티·AI시각화) 전부 정상. 상세: `log/redis-issue.md`
- **Task 2 재개**: `web/` 부분 스캐폴딩 커밋됨. 내일 `npm install` 상태 확인 후 이어서(브리프: `.superpowers/sdd/task-2-brief.md`). Next dev 서버는 백엔드(:3000)와 충돌 피해 `:3100` 사용.

## 5. 인프라 / 실행 방법 (내일 재현)

- 백엔드 `.env` 는 TiDB/Aiven/Gemini 실값으로 세팅됨(gitignored, 커밋 안 됨).
- 백엔드 로컬 구동: `cd C:\Users\kryuk\dev && node dist/main.js` (또는 `npm run start:dev`). 포트 3000.
  - Redis 미해결 상태면 BullMQ ParserError 로그 스팸 발생하나 HTTP 서버는 정상. AI 생성만 불가.
- 프론트 로컬(내일): `web/.env.local`의 `NEXT_PUBLIC_API_BASE=http://localhost:3000/api`, dev 서버 `:3100`.

## 6. 내일 순서 제안

1. Aiven Redis 접속정보 교정 → 백엔드 BullMQ 정상화 → AI 생성 라이브 확인.
2. Task 2 스캐폴딩 마무리(`npm install`, 부트 확인) → Task 3 orval(로컬 `http://localhost:3000/api/docs-json`에서 타입 생성).
3. 계획 순서대로 Task 4~16 (로그인/검색/생성/스튜디오/시각화/필기/조립/응시/채점/상세허브/오답노트/배포).

## 7. 브랜치

- 작업 브랜치: `feat/frontend-mvp` (main 아님).
- 커밋 히스토리: `log/commit-history.txt`
