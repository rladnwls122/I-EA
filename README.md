# IΔEA API

AI 문항 출제 · 모의고사 조립/응시 플랫폼의 백엔드 API. **NestJS 10 + Prisma(MySQL) + BullMQ(Redis)** 기반이며,
15개 핵심 테이블 + 3개 확장 테이블([prisma/schema.prisma](prisma/schema.prisma)) 스키마를 그대로 구현합니다.

## 실행

```bash
cp .env.example .env      # DB/Redis/JWT/Anthropic 키 채우기
npm install
npm run prisma:generate   # Prisma Client 생성
npm run prisma:migrate    # 스키마 마이그레이션(개발)
npm run start:dev
```

- API 프리픽스: `/api`
- Swagger 문서: `http://localhost:3000/api/docs`
- 인증: 전역 `JwtAuthGuard`(Bearer JWT). `@Public()`이 붙은 라우트만 예외.

## 모듈 구성 (테이블 → 모듈)

| 모듈 | 담당 테이블 | 핵심 엔드포인트 |
| --- | --- | --- |
| `catalog` | subjects, units, tags | `GET /subjects`, `GET /subjects/:id/units`(트리), `GET/POST /tags` |
| `questions` | questions, question_tags | `GET /questions`(필터·검색), `POST /questions`, `PATCH /questions/:id`, `POST /questions/:id/publish` |
| `ai-generation` | ai_generations, passages, questions | `POST /ai-generations`(비동기 202), `GET /ai-generations/:id` |
| `media` | media_assets | `GET/POST /media-assets`(지문 XOR 문제 배타 매핑), `DELETE /media-assets/:id` |
| `reviews` | question_reviews | `GET /questions/:id/reviews`, `PUT /questions/:id/reviews`(upsert) |
| `comments` | question_comments | `GET/POST /questions/:id/comments`(트리), `POST/DELETE /comments/:id/pin` |
| `exam-sessions` | exam_sessions, exam_session_questions, exam_session_answers | `POST /exam-sessions`(조립), `PUT /exam-sessions/questions/:id/answer`, `POST /exam-sessions/:id/submit` |
| `auth` | users, user_roles | `POST /auth/login`(이메일 프로비저닝 → JWT), `GET /auth/me` |
| `passages` | passages | `GET/POST /passages`, `PATCH /passages/:id`, `POST /passages/:id/publish` |
| `memos` | user_question_memos | `GET /me/memos`, `GET/PUT/DELETE /questions/:id/memo`(본인 전용) |
| `variants` | question_variants | `GET/POST /questions/:id/variants`(양방향), `DELETE /variants/:id` |

## 설계 포인트

- **문항 스냅샷**: 세션 조립 시 문제를 `exam_session_questions.snapshot`에 통째로 보존해, 원본이 이후 수정돼도 채점 근거가 고정됩니다.
- **정답 마스킹**: 진행 중(`IN_PROGRESS`) 세션 조회 시 선지 `isCorrect`·빈칸 정답·해설을 숨깁니다([grading.util.ts](src/modules/exam-sessions/grading.util.ts)).
- **즉시 채점**: OMR 답안 제출 시 스냅샷 기준으로 채점하고, 세션 최종 제출 시 `questions.total/correct_solved_count` 캐시를 갱신합니다.
- **콘텐츠 포맷**: `stem/choices/explanation`은 Tiptap/ProseMirror JSON. 조립·평문 추출은 [prosemirror.util.ts](src/common/prosemirror/prosemirror.util.ts)가 담당하며, `search_text` 캐시도 여기서 만듭니다.
- **권한**: `@Roles(...)` + `RolesGuard`로 마스터 데이터/발행 등 CREATOR·ADMIN 전용 작업을 제한합니다.

## 커버리지

15개 원본 테이블 + 3개 확장 테이블 전부에 대응하는 모듈이 구현되어 있습니다.
- 로그인은 `users`에 비밀번호 컬럼이 없어 **외부 IdP(OAuth/매직링크)로 검증된 email을 받는 프로비저닝 방식**입니다. 실제 배포 시 `POST /auth/login` 앞단에 소셜 로그인 검증을 두세요.
- 실행 검증은 이 환경에 Node가 없어 `tsc` 컴파일까지는 돌리지 못했습니다. `npm install && npm run build`로 최종 확인이 필요합니다.
