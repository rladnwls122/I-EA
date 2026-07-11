# IΔEA

AI 문항 출제 · 모의고사 조립/응시 플랫폼의 백엔드 API. **NestJS 10 + Prisma(MySQL) + BullMQ(Redis)** 기반이며,
MVP 리팩터링이 완료된 최신 스펙([prisma/schema.prisma](prisma/schema.prisma))을 구현합니다.

## 실행

```bash
cp .env.example .env      # DB/Redis/JWT/Gemini 키 채우기
npm install
npm run prisma:generate   # Prisma Client 생성
npm run prisma:migrate    # 스키마 마이그레이션(개발)
npm run start:dev
```

- **API 프리픽스**: `/api`
- **Swagger 문서**: `http://localhost:3000/api/docs`
- **인증**: 전역 `JwtAuthGuard`(Bearer JWT). `@Public()`이 붙은 라우트만 예외이며, 모든 API는 기본적으로 인증이 필요합니다.

## 모듈 구성 (핵심 엔드포인트)

| 모듈 | 담당 내용 | 핵심 엔드포인트 |
| --- | --- | --- |
| `auth` | 인증/인가 | `POST /auth/register`, `POST /auth/login`(이메일+비번), `GET /auth/me` |
| `catalog` | 분류/태그 | `GET /subjects`(3단 분류), `POST /subjects`(ADMIN), `GET/POST /tags` |
| `questions` | 문항 관리 | `GET /questions`(검색), `GET /questions/:id/stats`(통계), `POST /questions/:id/choices/regenerate`(AI) |
| `workbooks` | 문제집 | `GET /workbooks`(탐색), `POST /workbooks/:id/fork`, `POST /workbooks/:id/start`(바로풀기) |
| `exam-sessions`| 응시/채점 | `POST /exam-sessions`(조립), `PUT /exam-sessions/questions/:id/self-grade`(자기채점) |
| `ai-generation`| AI 자동생성 | `POST /ai-generations`(비동기 202), `GET /ai-generations/:id`(상태 폴링) |
| `media` | 미디어 | `POST /media-assets/presign`(S3 직접 업로드), `POST /media-assets`(등록) |
| `annotations` | 오답노트  | `GET/POST /questions/:id/annotations`, `PATCH/DELETE /annotations/:id` |
| `me` | 개인화 | `GET /me/exam-sessions`(풀이기록), `GET /me/notes`(통합 오답노트/통계) |
| `tutor` | AI 튜터 | `POST /tutor/chat`(SSE 스트리밍), `GET /tutor/history` |
| `passages` | 지문 관리 | `GET/POST /passages`, `PATCH /passages/:id`, `POST /passages/:id/publish` |
| `comments` | 댓글 | `GET/POST /questions/:id/comments`(트리), `PATCH/DELETE /comments/:id` |
| `reviews` | 평가 | `GET /questions/:id/reviews`, `PUT /questions/:id/reviews`(별점/난이도) |

## 설계 포인트

- **3단 분류 체계**: 기존 단원(units) 트리를 제거하고 `Subject`를 **시험(examType) - 대분류(examCategory) - 소분류(name)**의 3단 분류 리프로 직접 사용합니다.
- **문항 스냅샷**: 세션 조립 시 문제를 `exam_session_questions.snapshot`에 통째로 보존해, 원본이 이후 수정돼도 채점 근거가 고정됩니다.
- **정답 마스킹**: 진행 중(`IN_PROGRESS`) 세션 조회 시 선지 `isCorrect`·주관식 정답·해설을 숨깁니다.
- **채점 시스템**: 객관식 및 단답형 주관식은 자동 채점되며, 서술형 주관식은 응시 후 **자기채점(`self-grade`)**을 통해 정오를 확정합니다.
- **콘텐츠 포맷**: 모든 리치 텍스트는 Tiptap/ProseMirror JSON으로 저장됩니다. [prosemirror.util.ts](src/common/prosemirror/prosemirror.util.ts)가 조립 및 평문 추출을 담당합니다.
- **오답노트**: 단순 메모를 넘어 문항 내 특정 텍스트 영역에 하이라이트/밑줄과 함께 오답 원인 태그 및 메모를 남기는 **주석(Annotation)** 시스템을 제공합니다.
- **미디어 업로드**: 서버를 거치지 않고 클라이언트가 S3에 직접 업로드하는 **Presigned POST** 방식을 사용합니다.

## 참고 문서

- [AGENTS.md](AGENTS.md): 개발 가이드 및 아키텍처 상세
- [LOCAL_TEST_GUIDE.md](LOCAL_TEST_GUIDE.md): 로컬 인프라 설정 및 API 테스트 시나리오
- `docs/superpowers/plans/`: MVP 리팩터링 및 기능별 상세 설계 문서
