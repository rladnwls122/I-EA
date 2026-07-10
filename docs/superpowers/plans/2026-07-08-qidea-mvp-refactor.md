# Q-Idea MVP 리팩터링 계획 (스키마·API·프론트)

- 작성일: 2026-07-08 (2026-07-09 최신 스펙 반영하여 갱신됨)
- 대상: `C:\Users\user\Downloads\I-EA-main\I-EA-main` (IΔEA / Q-Idea)
- 목적: 데모용 MVP로 범위를 좁히고, **세부과목 기반 3단 분류 + 유형 단순화(객관식/주관식)**로 스키마를 정리한다.
- 선행 문서: `2026-07-06-qidea-frontend-mvp-design.md`(설계), `2026-07-06-qidea-frontend-mvp.md`(구현 태스크), `2026-07-09-qidea-frontend-redesign.md`(07-09 갱신 스펙).
- 원칙: **코드는 아직 작성하지 않는다.** 이 문서는 무엇을 바꿀지의 설계/변경 목록이다.

---

## 0. 범위 결정 (확정)

| 구분 | 항목 |
| --- | --- |
| **핵심 기능(구현)** | 문제 출제, 문제 풀이, 모의고사 조립(플레이리스트), 문제 검색·조회, 로그인/회원가입, 오답노트, 문제 통계·평가(별점/체감난이도), 댓글·대댓글, **문제집(Workbook)** |
| **유지 부가기능** | 지문(passage) 세트문항, AI 자동 문항생성(세부과목 기준), 풀이 힌트 |
| **제거** | 북마크(찜), 댓글 핀(고정), 변형문제(variants), AI 시각화 자동생성(Vega/SVG) |
| **대체 구현** | 시각자료 = **이미지 업로드 + 클라이언트 크롭(화면자르기)**으로 사이트 폭에 맞춤. 차트 렌더링 = **하드코딩된 react-vega 스펙 + 통계 데이터 바인딩** |

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
    2026-07-09-qidea-frontend-redesign.md     (프론트엔드 최신 스펙)
    2026-07-09-qidea-workbook-backend-plan.md (문제집 도입 및 백엔드 최신 스펙)
    2026-07-09-qidea-agent-trio-design.md     (서브에이전트 협업 체계)
  plans/
    2026-07-06-qidea-frontend-mvp.md          (참고: 초기 태스크. 스펙에 맞게 갱신됨)
    2026-07-08-qidea-mvp-refactor.md          (★ 현재 문서 — 최신 기준)
```

- 루트의 `claude.md`는 이미 `CLAUDE.md`로 갱신됨(정확한 아키텍처 반영).
- `exam_studio_db_schema.md`는 최신 MVP 스키마 구조를 담아 갱신되었다.

---

## 2. 스키마 구조 변경 계획 (`prisma/schema.prisma`)

### 2.1 핵심 변경: 단원 트리 제거 → 세부과목 3단 직접 분류

**결정: `units` 테이블을 제거하고, `subjects` 테이블에 3단 분류를 적용한다.**

| 컬럼 | 의미(변경 후) | 예시 |
| --- | --- | --- |
| `subjects.exam_type` | **시험 (새로 추가됨)** | 수능, 내신, 공무원 |
| `subjects.exam_category` | **대분류(과목군)** | 국어, 수학, 공시 |
| `subjects.name` | **세부과목** | 문학, 언어와매체, 화법과작문 |

- `Unit` 모델 삭제. 이에 딸린 자기참조(`parentUnitId`, `depth`, `isLeaf`, `path`, `UnitTree` 관계) 전부 제거.
- `Question.primaryUnitId` (NOT NULL, FK→units) → **`Question.subjectId` (NOT NULL, FK→subjects)** 로 교체.
- `AiGeneration.unitId` (FK→units) → **`AiGeneration.subjectId`** 하나로 통합.
- `questions` 인덱스 `@@index([primaryUnitId, status])` → `@@index([subjectId, status])`.

### 2.2 문제집(Workbook) 엔티티 추가 (확정)

- `workbooks` 테이블 신설. (문제집 제목, 생성자, 포크 출처 등)
- `workbook_questions` 테이블 신설하여 여러 문제집의 문항들을 교차 구성할 수 있도록 지원(Pick & Mix).
- `questions.subjectId`와 무관하게 여러 과목의 문항을 담을 수 있음.

### 2.3 유형 단순화: enum → varchar

- `enum QuestionType { SINGLE_CHOICE, MULTI_CHOICE, OX, SHORT_ANSWER, ESSAY }` **삭제**.
- `Question.questionType` → `String @db.VarChar(20)`. 허용값 `"객관식" | "주관식"` (앱단 상수/DTO 검증으로 제약).

### 2.4 주관식 채점 컬럼 추가

- `Question.correctAnswerText String? @map("correct_answer_text") @db.Text` 추가.
  - 객관식: null. 주관식-단답: 정답 문자열. 주관식-서술형: null(→ 자기채점).
- `ExamSessionAnswer.isCorrect`는 이미 nullable → 서술형은 제출 시 null, 자기채점 후 갱신.

### 2.5 빈칸([[blank]]) 방식 단순화

- **MVP에서는 이 방식을 폐기하고 `correct_answer_text` 컬럼 기반 단답 채점으로 통일.**
- 마스킹은 `correctAnswerText`만 숨기면 됨.

### 2.6 미디어: 이미지 전용 + 크롭

- `enum MediaAssetType { IMAGE, GRAPH_CODE, SVG }` → `IMAGE`만 유지. GRAPH_CODE/SVG·`sourceCode`(AI 그래프 재생성용) 제거.
- 프론트엔드가 이미지 크롭 결과를 **Supabase Storage**에 직접 업로드하고, 백엔드는 public URL만 `storageUrl`로 등록.

### 2.7 제거 대상 모델/컬럼

- `QuestionVariant` 모델 삭제.
- 북마크: **추가하지 않음**.
- 댓글 핀: `QuestionComment.isPinned` 제거(또는 미사용으로 방치).

---

## 3. API 구조 변경 계획

### 3.1 catalog (`src/modules/catalog`)

- `GET /subjects` 유지 — 프론트에서 `examType` → `examCategory` 단위로 그룹핑 처리.
- **`GET /subjects/:subjectId/units` 삭제**, **`POST /units` 삭제**.
- `POST /subjects`: `CreateSubjectDto`에 `examType`, `examCategory`, `name` 요구.

### 3.2 questions (`src/modules/questions`)

- `CreateQuestionDto`: `primaryUnitId` → **`subjectId`**. `questionType`는 `@IsIn(['객관식','주관식'])`.
- `GET /questions/:id/stats`: 문제별 선지 분포 및 시간, 정답률 반환(B1 Task).
- `POST /questions/:id/choices/regenerate`: AI 오답 선지 동기 생성 엔드포인트(B2 Task).

### 3.3 exam-sessions (`src/modules/exam-sessions`) — 조립

- **필터 기반 조립 유지 + 세부과목 필터.** `CreateSessionDto`:
  - `subjectId`(세부과목)는 nullable하게 변경(문제집 응시 시 교차과목 믹스 지원을 위함). 단, 필터 모드에서는 여전히 필수.
  - `workbookId` 필드 수용 (문제집 응시 식별).
  - `SessionFilterDto`: `unitIds` **삭제**, `questionTypes`(문자열 배열), `minDifficulty/maxDifficulty`, `tagIds` 유지.

### 3.4 채점 흐름 (`grading.util.ts` + service)

- 신규 엔드포인트: `PUT /exam-sessions/questions/:sessionQuestionId/self-grade` body `{ isCorrect: boolean }` — 서술형 자기채점 반영.

### 3.5 ai-generation (`src/modules/ai-generation`)

- `CreateGenerationDto.unitId` → **`subjectId`**(세부과목). 프롬프트 컨텍스트에 대분류+세부과목명+시험구분(examType) 전달 필수.

### 3.6 media (`src/modules/media`) — 이미지 업로드+크롭

- 클라이언트가 Supabase Storage에 직접 업로드하고, DB에는 public URL만 저장한다.
- `CreateMediaDto`: `assetType` IMAGE 고정, `sourceCode`(AI 그래프 재생성용) 제거. `storageUrl` 등록.

### 3.7 comments (`src/modules/comments`) — 핀 제거

- `POST /comments/:id/pin`, `DELETE /comments/:id/pin` **삭제**.
- 댓글 트리 정렬은 최신순만.

### 3.8 reviews / annotations(memos) / me

- reviews: 별점 `rating` + 체감난이도 `perceivedDifficulty` 이원화 유지.
- **오답노트 2.0 (memos → annotations 개편)**: 텍스트 앵커 주석(하이라이트/밑줄 + 오답원인 태그 + 플로팅 메모)으로 고도화.
  - 주석 CRUD: `GET/POST /questions/:id/annotations`, `PATCH/DELETE /annotations/:id`.
  - **통계+메모 병합 엔드포인트 `GET /me/notes`**: `summary` + `wrongQuestions` 제공.

---

## 4. 프론트엔드 계획 (`web/`)

초기 계획 화면 골격은 유지하되, 아래 사항을 반영하여 축소 및 교체한다.

### 4.1 화면 목록 (MVP)

| 라우트 | 화면 | 비고(변경점) |
| --- | --- | --- |
| `(auth)/login`, `(auth)/signup` | 로그인/회원가입 | 데모 계정 퀵버튼 |
| `questions` | 문제 검색/조회 | 필터: **세부과목(3단)** / 유형(객·주) / 난이도 / 키워드. 카드 정답률 |
| `questions/[id]` | 문제 상세 허브 | 핀 UI 제거 |
| `create` | AI 생성 폼 | **3단 과목 선택** + 프롬프트/난이도/문항수/지문포함/유형 |
| `studio/[genId]` | 출제 스튜디오 | **변형셸 제거**, **이미지 업로드+크롭 추가** |
| `exam/assemble` | 모의고사 조립 | **세부과목+유형+난이도 필터**(단원 다중선택 제거) |
| `exam/[sessionId]` | 응시(OMR+타이머) | 객관식 선택 / 주관식 텍스트 입력. 문항 필기(캔버스) 유지 |
| `exam/[sessionId]/result` | 채점 결과 | 객관식·단답 자동, **서술형 자기채점 O/X 버튼** |
| `me/notes` | 오답노트 통합 | **세부과목별·유형별** 오답비율 그래프 + 오답 문항 리스트(주석 중첩) |

### 4.2 컴포넌트 변경

- **제거:** `UnitTreeSelect`(단원 트리), AI Vega/SVG 시각화 Route Handler, `studio/VariantShell`, 댓글 핀 버튼, `KaTeX` 의존성 전체.
- **추가:** `catalog/SubjectSelect`(3단계 그룹핑 드롭다운), `media/ImageCropUpload`(크롭 후 업로드), 결과화면 `SelfGradeToggle`.
- **유지:** `QuestionViewer`(ProseMirror 렌더), `SketchCanvas`(응시 필기 전용), `react-vega` (정적 오답노트 통계 차트로만 재사용, AI 개입 없음).
- **오답노트 2.0 신규 컴포넌트:** `AnnotationLayer`(오버레이 렌더링), `AnnotationPopover`(호버/포커스 팝오버), `WrongNoteDashboard`.

---

## 5. 작업 순서 (제안)

1. **스키마 리팩터링**: `schema.prisma`(units/variants 제거, subject 직결 및 3단분류화, workbook 추가, questionType varchar) → `prisma generate` → 빌드.
2. **백엔드 서비스 정리**: catalog, questions/exam-sessions/ai-generation, grading(자기채점), media(업로드 URL 처리), comments(핀 제거), variants 제거, annotations 추가.
3. **시드 갱신**: 3단 세부과목·객/주 문항으로 재시드, `db push` 후 검증.
4. **프론트 축소·교체**: `SubjectSelect`, `ImageCropUpload` 추가 / UnitTree·AI Viz·KaTeX·Variant 제거.
5. **골든패스 스모크 테스트**

---

## 6. 확인 필요 / 열린 결정

- 모든 MVP 07-09 기획결정(Workbooks B안 채택, 3-tier 카테고리 적용, Supabase 이미지 업로드 등) **확정 및 해결 완료**.
