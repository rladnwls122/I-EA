# Q-Idea MVP 리팩터링 계획 (스키마·API·프론트)

- 작성일: 2026-07-08
- 대상: `C:\Users\user\Downloads\I-EA-main\I-EA-main` (IΔEA / Q-Idea)
- 목적: 데모용 MVP로 범위를 좁히고, **세부과목 기반 분류 + 유형 단순화(객관식/주관식)**로 스키마를 정리한다.
- 선행 문서: `2026-07-06-qidea-frontend-mvp-design.md`(설계), `2026-07-06-qidea-frontend-mvp.md`(구현 태스크). 본 문서는 그 위에 **범위 축소 + 스키마 변경**을 덮어쓰는 상위 계획이다.
- 원칙: **코드는 아직 작성하지 않는다.** 이 문서는 무엇을 바꿀지의 설계/변경 목록이다.

---

## 0. 범위 결정 (확정)

| 구분 | 항목 |
| --- | --- |
| **핵심 기능(구현)** | 문제 출제, 문제 풀이, 모의고사 조립(플레이리스트), 문제 검색·조회, 로그인/회원가입, 오답노트, 문제 통계·평가(별점/체감난이도), 댓글·대댓글 |
| **유지 부가기능** | 지문(passage) 세트문항, AI 자동 문항생성(세부과목 기준), 풀이 힌트 |
| **제거** | 북마크(찜), 댓글 핀(고정), 변형문제(variants), AI 시각화 자동생성(Vega/SVG) |
| **대체 구현** | 시각자료 = **이미지 업로드 + 클라이언트 크롭(화면자르기)**으로 사이트 폭에 맞춤 |

**채점 정책(확정):**
- 객관식 → 선택지 집합 자동 채점(기존 로직)
- 주관식-단답 → `correct_answer_text` 정규화 일치 자동 채점
- 주관식-서술형 → 자동 채점 없음, 결과 화면에서 응시자 **자기채점**(O/X)
- 단답 vs 서술형 구분은 **별도 유형이 아니라 데이터로 판별**: `correct_answer_text`가 있으면 자동 채점, 없으면 자기채점. (유형 컬럼은 `객관식`/`주관식`만 유지)

---

## 1. 문서구조 정리

```
docs/superpowers/
  specs/
    2026-07-06-qidea-frontend-mvp-design.md   (참고: 초기 설계. 일부 미채택)
  plans/
    2026-07-06-qidea-frontend-mvp.md          (참고: 초기 태스크. 범위 축소로 일부 폐기)
    2026-07-08-qidea-mvp-refactor.md          (★ 현재 문서 — 최신 기준)
```

- 루트의 `claude.md`는 이미 `CLAUDE.md`로 갱신됨(정확한 아키텍처 반영).
- `exam_studio_db_schema.md`는 **원본 DDL 참조용**으로 보존하되, 본 리팩터링과 어긋나는 부분(단원 트리, 북마크 등)은 이 문서의 §2가 우선한다.
- standalone HTML 2개(`출제 스튜디오`, `문제 상세`)는 화면 레퍼런스로만 사용.

---

## 2. 스키마 구조 변경 계획 (`prisma/schema.prisma`)

### 2.1 핵심 변경: 단원 트리 제거 → 세부과목 직접 분류

**결정: `units` 테이블을 제거하고, 기존 `subjects`를 "세부과목"으로 재사용한다.** 새 테이블을 만들지 않아 마이그레이션 비용이 가장 작다.

| 컬럼 | 의미(변경 후) | 예시 |
| --- | --- | --- |
| `subjects.exam_category` | **대분류(과목군)** | 국어, 수학, 공시 |
| `subjects.name` | **세부과목** | 문학, 언어와매체, 화법과작문 |

- `Unit` 모델 삭제. 이에 딸린 자기참조(`parentUnitId`, `depth`, `isLeaf`, `path`, `UnitTree` 관계) 전부 제거.
- `Question.primaryUnitId` (NOT NULL, FK→units) → **`Question.subjectId` (NOT NULL, FK→subjects)** 로 교체.
- `AiGeneration.unitId` (FK→units) → **`AiGeneration.subjectId`** 하나로 통합(기존 `subjectId`와 중복이므로 `unitId` 제거, `subjectId`를 NOT NULL로).
- `questions` 인덱스 `@@index([primaryUnitId, status])` → `@@index([subjectId, status])`.

### 2.2 유형 단순화: enum → varchar

- `enum QuestionType { SINGLE_CHOICE, MULTI_CHOICE, OX, SHORT_ANSWER, ESSAY }` **삭제**.
- `Question.questionType` → `String @db.VarChar(20)`. 허용값 `"객관식" | "주관식"` (앱단 상수/DTO 검증으로 제약).
- 파급: `CreateSessionDto.questionTypes`, `QueryQuestionDto.questionType`, `grading.util.ts`, `ai-generation.processor.normalizeType`, `llm.types.ts`의 유형 유니온 전부 문자열 기반으로 교체.

### 2.3 주관식 채점 컬럼 추가

- `Question.correctAnswerText String? @map("correct_answer_text") @db.Text` 추가(원본 DDL 3.6에 이미 존재하나 현 Prisma엔 없음).
  - 객관식: null. 주관식-단답: 정답 문자열. 주관식-서술형: null(→ 자기채점).
- `ExamSessionAnswer.isCorrect`는 이미 nullable → 서술형은 제출 시 null, 자기채점 후 갱신.
- 자기채점 반영을 위해 채점 흐름에 "응시자가 is_correct를 직접 세팅" 경로 추가(§3.4).

### 2.4 빈칸([[blank]]) 방식 단순화

- 현재 SHORT_ANSWER는 stem ProseMirror 안에 `blank` 노드로 정답을 심고 `grading.util`이 트리에서 정답을 수집한다.
- **MVP에서는 이 방식을 폐기하고 `correct_answer_text` 컬럼 기반 단답 채점으로 통일.**
- 영향: `prosemirror.util.ts`의 `buildRichDoc(text, blankAnswers)`에서 blank 로직 제거(평문→문단 변환만 유지), `grading.util`의 `collectBlankAnswers`·`maskBlanks` 제거, 마스킹은 `correctAnswerText`만 숨기면 됨.

### 2.5 미디어: 이미지 전용 + 크롭

- `enum MediaAssetType { IMAGE, GRAPH_CODE, SVG }` → `IMAGE`만 유지(또는 varchar). GRAPH_CODE/SVG·`sourceCode`(AI 그래프 재생성용) 제거.
- 크롭 결과를 그대로 업로드하므로 `width_px/height_px`는 유지(렌더 시 사이트 폭 대비 스케일에 사용).
- 저장 위치 결정 필요(§3.6): 외부 스토리지 URL vs 서버 업로드 엔드포인트.

### 2.6 제거 대상 모델/컬럼

- `QuestionVariant` 모델 삭제 + `Question`의 `variantsAsSource/variantsAsResult`, `variantGroupId`, `AiGeneration.variants` 관계 제거.
- 북마크: 현 Prisma엔 없음(원본 DDL `user_bookmarks`만 존재) → **추가하지 않음**.
- 댓글 핀: `QuestionComment.isPinned` 제거(또는 미사용으로 방치). 인덱스 `@@index([questionId, isPinned, createdAt])` → `@@index([questionId, createdAt])`.

### 2.7 마이그레이션 전략

- 로컬/데모는 데이터 보존 불필요 → **`prisma migrate reset` 또는 `db push` 후 재시드**가 가장 단순.
- Railway 배포는 이미 `prisma db push --accept-data-loss`를 사용(파괴적 동기화 허용) → 스키마만 맞추면 됨.
- `prisma/seed.ts` 갱신: 세부과목 시드(예: 국어→문학/언매/화작, 수학→미적분/기하), 유형은 `객관식`/`주관식`, PUBLISHED 문항 다수. `0001_qidea_extensions.sql`은 units/variants 참조 부분 정리 또는 폐기.

---

## 3. API 구조 변경 계획

### 3.1 catalog (`src/modules/catalog`)

- `GET /subjects` 유지 — 응답에 `examCategory`(대분류) 포함(이미 포함). 프론트가 대분류로 그룹핑.
  - (선택) `GET /subjects/grouped` 추가: `[{ examCategory, subjects: [...] }]` 형태로 서버 그룹핑 제공하면 프론트 단순화.
- **`GET /subjects/:subjectId/units` 삭제**, **`POST /units` 삭제**, `createUnit`/`unitTree` 서비스 로직 제거.
- `POST /subjects`: `CreateSubjectDto`에 `name`(세부과목) + `examCategory`(대분류). 권한은 기존 ADMIN 유지.
- tags 엔드포인트는 그대로(교차 태그로 계속 사용, 오답노트 유형별 집계에 유용).

### 3.2 questions (`src/modules/questions`)

- `CreateQuestionDto`: `primaryUnitId` → **`subjectId`**. `questionType`는 enum → `@IsIn(['객관식','주관식'])` 문자열. `correctAnswerText?` 추가. (객관식은 `choices` 필수, 주관식은 `choices` 없음 검증.)
- `QueryQuestionDto`: `unitId` → **`subjectId`**. `questionType`는 문자열. (검색 필터: 세부과목 + 상태 + 유형 + 난이도 + 키워드 + 태그.)
- `GET /questions/:id`, `POST /questions/:id/publish`, `PATCH`, `DELETE`는 시그니처 유지, 내부 unit 참조만 subject로 교체.
- `search_text` 캐시 로직 유지(발문/선지/해설/정답텍스트 합성).

### 3.3 exam-sessions (`src/modules/exam-sessions`) — 조립

- **필터 기반 조립 유지 + 세부과목 필터.** `CreateSessionDto`:
  - `subjectId`(세부과목) 유지.
  - `SessionFilterDto`: `unitIds` **삭제**, `questionTypes`(문자열 배열), `minDifficulty/maxDifficulty`, `tagIds` 유지.
  - (옵션) `questionIds?: string[]` 추가 → 있으면 **수동 플레이리스트 모드**(지정 문항 그대로 스냅샷), 없으면 필터로 랜덤 N. 저비용으로 양쪽 지원.
- 조립 시 `filter_criteria` 스냅샷은 그대로.
- 스냅샷/마스킹: 객관식은 선지 `isCorrect` 마스킹(기존), 주관식은 `correctAnswerText`·해설 마스킹.

### 3.4 채점 흐름 (`grading.util.ts` + service)

- `grade(snapshot, answer)` 유형 분기 재작성:
  - `객관식`: 선택 집합 == 정답 집합 (기존 SINGLE/MULTI/OX 통합).
  - `주관식` + `correctAnswerText` 존재: 정규화(trim/소문자/공백정리) 문자열 일치 → true/false.
  - `주관식` + `correctAnswerText` 없음: **null 반환(자기채점 대상)**.
- 신규 엔드포인트: `PUT /exam-sessions/questions/:sessionQuestionId/self-grade` body `{ isCorrect: boolean }` — 서술형 자기채점 반영. 세션 SUBMITTED 이후 또는 결과 화면에서 호출.
- 최종 제출 시 `question_stats`(total/correct) 캐시 갱신은 유지하되, 자기채점 null 항목은 집계 제외 또는 자기채점 후 반영.

### 3.5 ai-generation (`src/modules/ai-generation`)

- `CreateGenerationDto.unitId` → **`subjectId`**(세부과목). 프롬프트 컨텍스트에 대분류+세부과목명 전달.
- 프로세서: 생성 문항의 `primaryUnitId` → `subjectId`. `normalizeType`은 `객관식`/`주관식`으로 매핑(LLM엔 유형 힌트만).
- LLM 계약(`llm.types.ts`): 유형 유니온 → `'객관식'|'주관식'`. 객관식은 `choices`, 주관식은 `answerText`(단답 정답, 선택) 반환. `[[blank]]`/`shortAnswers` 제거.
- **활성 LLM은 Gemini 유지**(`GeminiLlmService`). Anthropic 서비스·`@anthropic-ai/sdk`는 미사용 정리 후보.

### 3.6 media (`src/modules/media`) — 이미지 업로드+크롭 (B안 · Supabase Storage 확정)

**결정: 클라이언트가 Supabase Storage에 직접 업로드하고, DB에는 public URL만 저장한다.** 백엔드는 파일 바이트를 다루지 않아 Cloudflare Pages(edge) 배포 제약과 충돌 없고, 파일 업로드 엔드포인트도 불필요하다. `media_assets.storage_url`(VarChar 500)을 그대로 활용한다.

- `CreateMediaDto`: `assetType` IMAGE 고정, `sourceCode`(AI 그래프 재생성용) 제거. `storageUrl`(업로드 완료 public URL), `widthPx/heightPx`(크롭 결과 크기) 유지. 지문 XOR 문제 배타 매핑 로직 유지.

**업로드 흐름 (프론트 주도, 백엔드는 URL 등록만):**
1. 파일 선택 → 크롭/리사이즈(§4.2 `ImageCropUpload`, 긴 변 ~1200px·JPEG 0.8) → 최종 Blob 생성.
2. `supabase-js`의 `storage.from(bucket).upload(path, blob)`로 **클라가 직접 업로드** → `getPublicUrl(path)`로 public URL 획득. presign/백엔드 왕복 없음.
3. 업로드 성공 후 기존 `POST /media-assets` `{ assetType:'IMAGE', storageUrl: publicUrl, widthPx, heightPx, questionId|passageId }`로 매핑만 등록.

**백엔드 작업:** 없음(0줄). 클라가 Storage에 직접 올리고, `media_assets` 등록만 기존 엔드포인트 재사용.

**환경/설정:**
- 프론트 env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. 프론트에 `@supabase/supabase-js` 추가.
- 버킷: `question-media`(public 버킷 — 문항 이미지는 공개 콘텐츠). 키 프리픽스 예: `questions/{questionId}/{uuid}.jpg`.
- Storage RLS 정책: 익명 public-read 허용, 업로드(insert)는 인증 사용자로 제한(데모 단순화 시 anon insert 허용도 가능하나 프로덕션은 제한 권장).
- CORS: 프론트 origin(Cloudflare Pages 도메인) 허용.
- 크롭 결과가 클라에서 확정되므로 원본 파일은 서버·DB 어디에도 남지 않음(용량 부담 없음).

### 3.7 comments (`src/modules/comments`) — 핀 제거

- `POST /comments/:id/pin`, `DELETE /comments/:id/pin` **삭제**, `setPinned` 서비스 제거.
- 댓글 트리 정렬은 `isPinned` 제외하고 최신순만. 나머지(작성/수정/삭제/대댓글) 유지.

### 3.8 reviews / memos / me

- reviews: 그대로(별점 `rating` + 체감난이도 `perceivedDifficulty` 이원화 유지 — "문제 통계와 평가" 핵심).
- **오답노트 2.0 (memos → annotations 개편)**: 단일 메모(content+canvas)를 **텍스트 앵커 주석**(하이라이트/밑줄 + 오답원인 태그 + 플로팅 메모)으로 고도화. 문제당 다행. 상세 설계는 **`2026-07-08-qidea-wrongnote-annotation-design.md`** 참조.
  - 주석 CRUD: `GET/POST /questions/:id/annotations`, `PATCH/DELETE /annotations/:id`. (옛 `/me/memos`, `/questions/:id/memo` 제거.)
  - **통계+메모 병합 엔드포인트 `GET /me/notes`**: `summary`(bySubject·byType·byReason) + `wrongQuestions`(각 문항의 내 주석 중첩)를 한 번에. 집계 키 unit→subject.
  - `GET /me/exam-sessions`(풀이기록)는 유지.

### 3.9 변형(variants) 모듈 제거

- `src/modules/variants` 삭제, `app.module.ts`에서 등록 해제, 관련 라우트 제거.

---

## 4. 프론트엔드 계획 (`web/`)

초기 계획(2026-07-06) 화면 골격은 유지하되, 아래를 반영해 축소·교체한다.

### 4.1 화면 목록 (MVP)

| 라우트 | 화면 | 비고(변경점) |
| --- | --- | --- |
| `(auth)/login`, `(auth)/signup` | 로그인/회원가입 | 이메일+비밀번호(bcrypt). 데모 계정 퀵버튼 |
| `questions` | 문제 검색/조회 | 필터: **세부과목**/유형(객·주)/난이도/키워드. 카드에 정답률 |
| `questions/[id]` | 문제 상세 허브 | 해설+정답률+별점리뷰+댓글·대댓글+개인메모. **핀 UI 제거** |
| `create` | AI 생성 폼 | **세부과목 선택(트리 없음)** + 프롬프트/난이도/문항수/지문포함/유형 |
| `studio/[genId]` | 출제 스튜디오 | 렌더+경량 인라인 편집+발행. **변형셸 제거**, **이미지 업로드+크롭 추가** |
| `exam/assemble` | 모의고사 조립 | **세부과목+유형+난이도 필터**(단원 다중선택 제거) |
| `exam/[sessionId]` | 응시(OMR+타이머) | 객관식 선택 / 주관식 텍스트 입력. 문항 필기(캔버스) 유지 |
| `exam/[sessionId]/result` | 채점 결과 | 객관식·단답 자동, **서술형 자기채점 O/X 버튼** |
| `me/notes` | 오답노트·풀이기록 | **세부과목별·유형별** 오답비율 그래프 + 오답 문항 리스트 |

### 4.2 컴포넌트 변경

- **제거:** `UnitTreeSelect`(단원 트리), `viz/VizRenderer`의 Vega/SVG 및 `app/api/ai/visualize` Route Handler, `studio/VariantShell`, 댓글 핀 버튼.
- **추가:** `catalog/SubjectSelect`(대분류로 그룹핑된 세부과목 드롭다운), `media/ImageCropUpload`(크롭 후 업로드 — `react-image-crop` 또는 canvas 기반), 결과화면 `SelfGradeToggle`.
- **유지:** `QuestionViewer`(ProseMirror 렌더 + KaTeX 수식), `SketchCanvas`(응시 필기 전용으로 축소), `CommentTree`(대댓글, depth 캡), `ReviewPanel`(별점+체감난이도), `WrongNoteChart`(오답비율 막대그래프 — 차트는 유지, AI 시각화만 제거).
- **오답노트 2.0 신규 컴포넌트:** `AnnotationLayer`(문항 위 하이라이트/밑줄 오버레이 재적용), `AnnotationPopover`(드래그 생성 + 호버 플로팅 메모 + **확장 시 modal Popover 승격 → 포커스 트랩**), `WrongNoteDashboard`(bySubject/byType/byReason). 상세: `2026-07-08-qidea-wrongnote-annotation-design.md` §5.
- 오답노트 차트는 `react-vega`를 **정적 스펙**으로만 사용(안전). AI가 스펙을 만드는 부분만 제거.

### 4.3 데이터 흐름

- 인증: JWT localStorage + `Authorization: Bearer` 자동 첨부(기존 유지).
- 서버상태: TanStack Query. 클라상태: 응시 OMR/타이머는 Zustand.
- 세부과목: `GET /subjects`를 대분류로 그룹핑해 셀렉트 구성.
- 이미지: 크롭 완료 → (B안) `POST /media-assets/upload` → URL → 문항/지문에 매핑.

---

## 5. 작업 순서 (제안)

1. **스키마 리팩터링**: `schema.prisma`(units/variants 제거, subject 직결, questionType varchar, correctAnswerText, media 축소) → `prisma generate` → 빌드.
2. **백엔드 서비스 정리**: catalog(units 제거), questions/exam-sessions/ai-generation(subject 직결·유형 문자열), grading(객·주 분기+자기채점 엔드포인트), media(업로드), comments(핀 제거), variants 모듈 제거, `/me` 엔드포인트(subject 집계).
3. **시드 갱신**: 세부과목·객/주 문항으로 재시드, `db push` 후 검증.
4. **프론트 축소·교체**: SubjectSelect, ImageCropUpload, SelfGradeToggle 추가 / UnitTree·Viz·Variant·핀 제거.
5. **골든패스 스모크**: 로그인 → (출제)AI생성/수기출제+이미지 → 발행 → 검색 → 조립 → 응시 → 채점(자기채점 포함) → 상세(리뷰/댓글/메모) → 오답노트 그래프.

---

## 6. 확인 필요 / 열린 결정

- **이미지 업로드**: B안 · **Supabase Storage 확정**(§3.6). 백엔드 추가 0줄, 클라 직접 업로드. 남은 잡일 = Supabase 프로젝트/버킷 생성 + RLS·CORS 설정.
- **`GET /subjects/grouped` 서버 그룹핑 추가 여부**(프론트 그룹핑으로도 가능).
- **모의고사 수동 플레이리스트 모드**(`questionIds`) 실제 노출 여부 — 우선 필터 기반, 여력 시 추가.
- **Anthropic LLM 서비스/SDK 제거 여부**(현재 미사용).
