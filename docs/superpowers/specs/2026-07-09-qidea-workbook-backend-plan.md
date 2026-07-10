# Q-Idea 백엔드·DB 변경 계획 — 문제집(Workbook) 도입 + 3단 분류

- 작성일: 2026-07-09
- 상태: **결정 완료, 구현 대기**
- 선행 문서: `specs/2026-07-09-qidea-frontend-redesign.md` (이 문서가 §2 미결을 해소한다)
- 근거 코드: `prisma/schema.prisma`, `src/modules/exam-sessions/exam-sessions.service.ts`, `src/modules/ai-generation/llm/*`, `src/modules/catalog/*`

---

## 0. 확정된 결정

프론트 재설계 스펙 §9 "미결 사항"과 요구서 검토 과정에서 나온 세 가지를 확정한다.

| # | 쟁점 | 결정 |
| --- | --- | --- |
| 1 | 문제집 엔티티 (재설계 스펙 §2 A/B/C) | **(B) `workbooks` 테이블 신설** |
| 2 | 분류 계층 | **3단: 시험(수능/내신) → 대분류(국어/수학) → 소분류(문학/미적분)**. flat `subjects.exam_type` 컬럼 |
| 3 | 문제집의 다과목 허용 | **허용.** `exam_sessions.subject_id`를 nullable로 완화 |

> 재설계 스펙 §2는 "(A) 전제"로 작성돼 있다. **이 문서가 §2를 대체한다.** §4.1 데이터 흐름을 (B)로 교체해야 하며, UI는 동일하다.

---

## 1. 분류 3단화 — `subjects.exam_type`

### 1.1 스키마

```prisma
model Subject {
  id           String @id @default(uuid()) @db.Char(36)
  examType     String @map("exam_type") @db.VarChar(50)      // 수능 | 내신 | 공무원
  examCategory String @map("exam_category") @db.VarChar(50)  // 국어 | 수학
  name         String @db.VarChar(100)                        // 문학 | 미적분
  sortOrder    Int     @default(0) @map("sort_order")
  isActive     Boolean @default(true) @map("is_active")

  @@unique([examType, examCategory, name])
  @@index([examType, examCategory, sortOrder])
  @@map("subjects")
}
```

### 1.2 리프 행 복제는 의도된 것이다

`문학`은 한 행이 아니라 **경로마다 한 행**이 된다.

```
(수능, 국어, 문학)   ← 별개 행
(내신, 국어, 문학)   ← 별개 행
(수능, 수학, 미적분)
```

`questions.subjectId`가 리프를 가리키므로 **한 문항은 정확히 하나의 (시험·대분류·소분류) 삼중항에 묶인다.** 수능 문학 문항은 내신 문제집에 담을 수 없다.

이는 정규화로 피할 수 없다(3테이블로 쪼개도 리프는 경로당 하나). 복제를 없애려면 `시험 ↔ 소분류` M:N + `questions.examType`이 필요한데, 채택하지 않았다. 근거:

- `CLAUDE.md`가 "단원 트리 없음"을 명시적 설계 원칙으로 세웠고 flat 패턴이 일관된다.
- Cascading 필터가 쿼리 한 번으로 끝난다 (`distinct examType` → `distinct examCategory` → `subjects`).
- 수능 문학과 내신 문학은 실제로 **다른 문항 풀**이므로 삼중항 결속이 도메인에 맞다.

대가는 `subjects` 행 수가 시험 종류만큼 곱해지는 것뿐이다. 마스터 데이터라 규모가 작다.

### 1.3 ⚠️ LLM 프롬프트가 스키마보다 민감하다

`gemini-llm.service.ts:136`이 프롬프트에 `대분류: ${ctx.examCategory}`를 주입한다. **`시험: ${ctx.examType}`을 같이 넣지 않으면 내신용 문항을 요청해도 수능 스타일로 생성된다.** 스키마만 고치고 여기를 빠뜨리면 조용히 잘못된 문항이 만들어진다.

변경 대상:
- `llm/llm.types.ts` — `GenerationContext`에 `examType?: string` 추가
- `llm/gemini-llm.service.ts` — 프롬프트 라인 추가
- `ai-generation/ai-generation.processor.ts:38,59` — `subject.select`에 `examType` 추가 후 컨텍스트 전달

### 1.4 ⚠️ 마이그레이션 함정

프로덕션은 `prisma db push --skip-generate --accept-data-loss` (`package.json`의 `start:railway`)를 쓰며 마이그레이션 파일을 쓰지 않는다. 기존 `subjects` 행이 있는 상태에서 NOT NULL 컬럼을 그냥 추가하면 push가 막힌다.

**2단계로 나눈다:**
1. `examType String @default("수능")` 으로 추가 → push → 기존 행 백필
2. `@default` 제거 → push

### 1.5 그 외 변경 지점 (`examCategory` 참조 9곳)

- `catalog/dto/catalog.dto.ts` — `CreateSubjectDto.examType` 필드 추가
- `catalog/catalog.service.ts:16` — `orderBy`에 `examType` 선행 추가
- `catalog/catalog.controller.ts` — Swagger 설명 갱신
- `questions/questions.service.ts:71` — `subject.select`에 `examType` 추가
- `prisma/seed.ts:36,41` — 시드 행에 `examType: '수능'`
- `prisma/schema.prisma:4,86` — 상단 주석 갱신

---

## 2. 문제집(Workbook) 엔티티 신설

### 2.1 신규 테이블

```prisma
model Workbook {
  id            String  @id @default(uuid()) @db.Char(36)
  ownerId       String  @map("owner_id") @db.Char(36)
  title         String  @db.VarChar(200)
  description   String? @db.Text
  coverImageUrl String? @map("cover_image_url") @db.VarChar(500)
  visibility    String  @default("PRIVATE") @db.VarChar(20)   // PRIVATE | PUBLIC
  forkedFromId  String? @map("forked_from_id") @db.Char(36)   // 통째 포크 출처

  // 카드 메타데이터 캐시 — questions.viewCount 선례를 따른다
  viewCount     Int @default(0) @map("view_count")
  forkCount     Int @default(0) @map("fork_count")
  questionCount Int @default(0) @map("question_count")

  publishedAt DateTime? @map("published_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  owner      User               @relation(fields: [ownerId], references: [id])
  forkedFrom Workbook?          @relation("WorkbookFork", fields: [forkedFromId], references: [id], onDelete: SetNull)
  forks      Workbook[]         @relation("WorkbookFork")
  questions  WorkbookQuestion[]
  sessions   ExamSession[]

  @@index([visibility, viewCount])
  @@index([ownerId, updatedAt])
  @@map("workbooks")
}

model WorkbookQuestion {
  workbookId       String  @map("workbook_id") @db.Char(36)
  questionId       String  @map("question_id") @db.Char(36)
  displayOrder     Int     @map("display_order")
  // 문항 단위 Pick 출처 (어느 문제집에서 담아왔는가)
  sourceWorkbookId String? @map("source_workbook_id") @db.Char(36)
  addedAt          DateTime @default(now()) @map("added_at")

  workbook Workbook @relation(fields: [workbookId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@id([workbookId, questionId])
  @@index([questionId])
  @@map("workbook_questions")
}
```

### 2.2 포킹은 2종이다

요구서의 "포킹"과 "담기"는 다른 연산이다. 둘 다 필요하다.

| 연산 | 저장 위치 | 의미 |
| --- | --- | --- |
| 문제집 통째 복제 | `Workbook.forkedFromId` | 남의 문제집을 내 것으로 복사 |
| 문항 단위 Pick | `WorkbookQuestion.sourceWorkbookId` | 여러 문제집에서 문항만 골라 재구성 |

요구서 §4의 `[➕ 내 문제집에 담기]`는 **후자**다.

### 2.3 담기(Pick)는 참조다 — 복사가 아니다

`workbook_questions`는 `questionId`를 **참조**한다. 결과:

- 원저자가 문항을 수정하면 내 문제집의 문항도 바뀐다.
- 원저자가 `ARCHIVED` 처리하면 내 문제집에서 사라진다.

**응시는 안전하다.** `exam_session_questions.snapshot`이 조립 시점에 문항을 통째 복사하므로 이미 푼 시험은 절대 변하지 않는다(`CLAUDE.md`의 "snapshot at assembly").

따라서 **참조 유지 + 원본 hard delete 금지**로 간다. 담기 대상은 `status = 'PUBLISHED'`인 문항으로 제한한다.

### 2.4 문제집에 태그는 없다 (확정)

요구서는 문제집 카드 메타데이터로 "조회수, 평균 점수, **태그**"를 요구하지만, **`workbook_tags`를 만들지 않는다.**

- `tags` / `question_tags`는 **문항에만** 붙는다. 문제집은 태그를 갖지 않는다.
- 문제집 카드에서 태그 슬롯은 **렌더하지 않는다.** 더미 데이터를 넣지 않는다.
- 카드에 분류 힌트가 필요하면 담긴 문항들의 `subject`(시험/대분류/소분류)를 파생 표시한다. 별도 테이블은 없다.

### 2.5 장바구니(Cart)는 서버 상태가 아니다

요구서의 플로팅 바(`현재 4문제 담김 🛒`)는 **DB 테이블을 만들지 않는다.** 클라이언트 `Zustand + persist`로 충분하고, 최종 "문제집 생성" 시점에 `POST /workbooks` 한 번만 호출한다. 디바이스 간 동기화가 요구사항이 되면 그때 재검토한다.

### 2.6 "최근 내가 본 문제집"

`workbook_views(userId, workbookId, viewedAt)` + `@@unique([userId, workbookId])` upsert. 단, **디바이스 간 동기화가 필요 없으면 localStorage로 충분하다**(재설계 스펙 §5.4도 동일 권고). 서버 테이블은 비용 대비 효익 확인 후 착수한다. → **컷라인 후보**

---

## 3. 다과목 세션 허용 — 조용한 문항 손실 수정

### 3.1 현재 버그

`exam-sessions.service.ts:39`:

```ts
where: { id: { in: dto.questionIds }, status: 'PUBLISHED', subjectId: dto.subjectId }
```

수동 플레이리스트가 **단일 세부과목으로 강제 필터링**된다. Pick & Mix는 정의상 여러 문제집(=여러 소분류)을 넘나든다.

국어 6문제 + 수학 4문제를 담아 풀면, 수학 4문제는 **에러 없이 조용히 버려지고** 6문제짜리 시험이 만들어진다. `picked.length === 0`일 때만 예외를 던지므로(44행) 사용자는 알아챌 방법이 없다.

### 3.2 수정

- `exam_sessions.subject_id` → **nullable**
  - 제약 완화(`NOT NULL → NULL`)이므로 **기존 행 백필 불필요.** `db push`로 안전.
- `exam_sessions.workbook_id` 추가 (nullable) — 문제집 평균점수 집계원
- `exam-sessions.service.ts:39` — `subjectId` 필터 제거
- `exam-sessions.service.ts:83` — `subjectId: dto.subjectId ?? null`

### 3.3 DTO는 조건부 필수다

**필터 모드는 `subjectId`를 계속 필요로 한다.** `buildQuestionWhere:385`가 `subjectId: dto.subjectId`로 후보를 좁힌다. 플레이리스트 모드만 풀어준다.

```ts
// create-session.dto.ts
@ValidateIf((o) => !o.questionIds?.length)   // 필터 모드에서만 필수
@IsUUID()
subjectId?: string;
```

---

## 4. 통계 위젯 지원 (재설계 스펙 Task B1 보강)

### 4.1 ⚠️ `exam_session_questions`에 인덱스가 하나도 없다

현 스키마 287–302행. Task B1의 집계 경로는
`exam_session_answers → exam_session_questions(question_id) → exam_sessions(status)` 조인인데, `questionId` 인덱스 부재로 **문항 상세를 열 때마다 풀스캔**이 걸린다. 오답노트 탭에서 위젯 2개가 매번 호출되므로 초기부터 문제가 된다.

```prisma
model ExamSessionQuestion {
  // ...
  @@index([questionId])
  @@index([examSessionId])
}
```

### 4.2 선지별 분포는 실시간 집계하지 않는다

`selectedChoiceIds`가 `Json` 배열이고, 재설계 스펙이 TiDB 호환을 이유로 MySQL JSON 함수 사용을 금지했다. 앱단 집계는 전체 답안 행을 끌어와야 한다.

`questions.totalSolvedCount` 캐시 선례를 따라 **제출 시점에 카운터를 갱신**한다.

```prisma
model QuestionChoiceStat {
  questionId String @map("question_id") @db.Char(36)
  choiceId   String @map("choice_id") @db.VarChar(36)  // "c1".."c8" (문항 로컬 id)
  count      Int    @default(0)

  @@id([questionId, choiceId])
  @@map("question_choice_stats")
}
```

선지 id는 `seed.ts`가 보여주듯 `"c1"~"c4"` 형태의 문항 로컬 문자열이라 키로 쓸 수 있다.

#### 선지 수정 시 통계 리셋 (확정)

출제자가 선지를 재배열/교체하면 누적 카운트가 오염된다. **규칙: 그냥 리셋한다.**

`PATCH /questions/:id`의 본문에 `choices`가 포함되면, 같은 트랜잭션 안에서:

```ts
await tx.questionChoiceStat.deleteMany({ where: { questionId: id } });
await tx.question.update({
  where: { id },
  data: { totalSolvedCount: 0, correctSolvedCount: 0, totalTimeSpentSec: 0, timedSolvedCount: 0 },
});
```

- `choices`가 본문에 없는 수정(발문·해설만 변경)은 통계를 보존한다.
- 리셋은 **집계 캐시만** 지운다. `exam_session_answers` 원본 응답과 `exam_session_questions.snapshot`은 건드리지 않으므로 **과거 응시 기록·채점 결과는 그대로다.**
- 결과적으로 통계 위젯은 표본이 다시 쌓일 때까지 `null`을 반환한다(표본 임계값 규칙, §9-2).

### 4.3 평균 풀이 시간 O(1)

`questions`에 카운터 2개 추가. `exam_session_answers.timeSpentSec`를 매번 평균내지 않는다.

```prisma
totalTimeSpentSec Int @default(0) @map("total_time_spent_sec")
timedSolvedCount  Int @default(0) @map("timed_solved_count")
```

---

## 5. API 변경 요약

| 엔드포인트 | 상태 | 비고 |
| --- | --- | --- |
| `GET /workbooks` | 🆕 | 홈 탐색·필터·정렬 (주력) |
| `POST /workbooks`, `GET/PATCH /workbooks/:id` | 🆕 | |
| `POST /workbooks/:id/fork` | 🆕 | 통째 복제 |
| `POST /workbooks/:id/questions`, `DELETE .../:questionId` | 🆕 | Pick & Mix |
| `PUT /workbooks/:id/questions/order` | 🆕 | 순서 재배열 (전체 순서 통째로) |
| `POST /workbooks/:id/start` | 🆕 | 문제집 바로 풀기 (`skippedQuestionIds` 반환) |
| `GET /questions/:id/stats` | Task **B1** | §4 카운터 기반으로 재설계 |
| `POST /questions/:id/choices/regenerate` | Task **B2** | Gemini 동기 호출, 10s 타임아웃, 실패 시 502 |
| `GET /search/trending` + `search_logs` | ❌ **제외 확정** | 인기도는 `viewCount`로 대체 (§10의 10번) |
| `GET /subjects` | 변경 | `examType` 필드 추가 |
| `POST /exam-sessions` | 변경 | `subjectId` 조건부 필수, `workbookId` 수용 |
| Q&A 대댓글 트리 | ✅ **이미 존재** | `question_comments.parentCommentId` 자기참조 + `comments` 모듈 |
| 오답노트 통계/주석 | ✅ **이미 존재** | `GET /me/notes`, `annotations` 모듈 |

---

## 6. 백엔드 작업이 아닌 것

- **KaTeX 제외** — 백엔드는 이미 준수 중이다. LLM은 평문만 반환하고 ProseMirror 조립은 `prosemirror.util.ts`가 소유한다(`CLAUDE.md`). 남은 건 `web/package.json:24`의 `katex@^0.17.0` 의존성 제거뿐, **순수 프론트 작업**이다.
- **장바구니** — §2.5. 클라이언트 상태.
- **문제집 태그** — §2.4. `workbook_tags`를 만들지 않는다. 카드에서 태그 슬롯을 렌더하지 않는다.
- Cascading 필터 애니메이션, 검색 포커스 딤 처리, 카드 호버 네온 효과 — 전부 프론트.

---

## 7. 그 외 관찰

`questions.searchText` 컬럼은 있으나 **FULLTEXT 인덱스가 없다**(인덱스는 `status`, `subjectId+status`, `totalSolvedCount`, `viewCount` 4개뿐). 문제집 탐색이 홈 화면 주력이 되면 검색 성능을 별도로 봐야 한다.

---

## 8. 구현 순서

| 순서 | 작업 | 선행 | 비고 |
| --- | --- | --- | --- |
| 1 | `subjects.examType` 2단계 마이그레이션 + 시드 | — | §1.4 |
| 2 | LLM 프롬프트/컨텍스트에 `examType` 주입 | 1 | §1.3 — **빠뜨리면 조용히 오작동** |
| 3 | `exam_session_questions` 인덱스 추가 | — | §4.1, 독립 |
| 4 | `workbooks` + `workbook_questions` + CRUD | 1 | §2 |
| 5 | `exam_sessions` nullable + `workbookId` + DTO 조건부 검증 | 4 | §3 |
| 6 | Pick/Fork 엔드포인트 | 4 | §2.2 |
| 7 | `question_choice_stats` + 시간 카운터 + 제출 시 갱신 | 3 | §4.2, §4.3 |
| 8 | Task B1 `GET /questions/:id/stats` | 7 | 프론트 블로커 |
| 9 | Task B2 인라인 선지 재생성 | — | 프론트 블로커, 독립 |
| 10 | Task B3 `search_logs` + trending | — | 컷라인 후보 |
| 11 | `workbook_views` | 4 | 컷라인 후보 (§2.6) |

8·9가 프론트를 블록한다. 병렬로 시작할 것.

---

## 9. 남은 미결

1. ~~선지 재배열 시 통계 리셋 규칙~~ → **확정: 그냥 리셋한다** (§4.2)
2. ~~표본 임계값 10~~ → **확정: `STATS_MIN_SAMPLE = 10`** (§10의 8번). 비율에만 적용, 분포에는 미적용.
3. ~~문제집 태그~~ → **확정: 만들지 않는다** (§2.4)
4. ~~오답 선지 재생성 시 정답 보존~~ → **확정: 정답까지 전체 재생성. 대신 DB에 쓰지 않는다** (§10의 9번)
5. **`workbook_views` 서버 저장 여부** (§2.6).

---

## 10. 구현 현황

| 순서 | 작업 | 상태 |
| --- | --- | --- |
| 1 | `subjects.examType` **1단계** 마이그레이션 + 시드 + 카탈로그 | ✅ 완료 |
| 1' | `subjects.examType` **2단계** (`@default` 제거) | ⏸ 백필 후 |
| 2 | LLM 프롬프트/컨텍스트에 `examType` 주입 | ✅ 완료 |
| 3 | `exam_session_questions` 인덱스 추가 | ✅ 완료 |
| 4 | `workbooks` + `workbook_questions` + CRUD | ✅ 완료 |
| 5 | `exam_sessions` nullable + `workbookId` + DTO 조건부 검증 | ✅ 완료 |
| 6 | Pick / Fork 엔드포인트 | ✅ 완료 |
| 7 | `question_choice_stats` + 시간 카운터 + 제출 시 갱신 + 리셋 | ✅ 완료 |
| 8 | Task B1 `GET /questions/:id/stats` + 문제집 평균 점수 캐시 | ✅ 완료 |
| 9 | Task B2 `POST /questions/:id/choices/regenerate` | ✅ 완료 |
| 10 | Task B3 `search_logs` + 인기 검색어 | ❌ **제외 확정** |
| 11 | `workbook_views` (최근 본 문제집) | ⬜ 미착수 (컷라인) |

### 10 — 인기 검색어는 만들지 않는다 (확정)

`search_logs` 테이블과 `GET /search/trending`을 **구현하지 않는다.** 검색 패널에서 "🔥 실시간 인기 검색어" 슬롯은 **렌더하지 않는다.** 더미 데이터를 넣지 않는다.

대신 **조회수(`viewCount`)만으로 인기도를 표현한다.** 이미 구현돼 있다:

- `questions.view_count` / `workbooks.view_count` — 상세 조회 시 증가
- 목록의 `sort=popular` — `viewCount desc`
- `@@index([viewCount])` / `@@index([visibility, viewCount])`

조회수 관련해 두 가지를 함께 고쳤다:

- **소유자의 자기 문제집 조회는 세지 않는다.** 편집하며 여러 번 열면 인기순이 자기 문제집으로 오염된다.
- **`GET /workbooks/:id` 응답의 `viewCount`가 1 뒤처지던 것**을 수정했다(스냅샷을 읽은 뒤 별도 `update`로 증가시켜, 증가 전 값을 반환하고 있었다). `questions.getById`는 `update`가 갱신된 레코드를 그대로 돌려주므로 원래 정확했다.

### 9에서 확정한 것 — 정답까지 갈아엎는다

§9-4의 미결을 **"정답 보존 안 함 = 전체 재생성"**으로 확정했다. AI가 선지 집합 전체를 새로 만들고 어느 것이 정답인지도 새로 정한다.

이 결정의 필연적 귀결로 **엔드포인트는 DB에 쓰지 않는다.** 저장하면 출제자가 쓴 정답이 말없이 사라지기 때문이다. 응답은 후보일 뿐이고(`persisted: false`), 출제자가 확인한 뒤 `PATCH /questions/:id`로 확정한다. 그때 §4.2 규칙대로 누적 통계가 리셋된다.

- **소유권 검사는 `@Roles(CREATOR)`가 아니라 `assertOwner`** — 남의 문항 선지를 재생성할 수 없다. `PATCH`와 같은 기준.
- **`stemText`는 body로 받는다.** 저장된 발문이 아니라 에디터에 떠 있는 현재 텍스트다(지문 수정 직후 저장 없이 누르는 버튼).
- **단일정답 검증이 급소다.** 정답이 0개면 `grading.util`의 채점이 항상 `null`이 되고, 2개면 "전부 골라야 정답"이 된다. 개수 불일치·빈 선지도 함께 거부한다. 위반 시 `503`.
- **타임아웃 10초** (`AbortSignal.timeout`). 기존 비동기 배치(`generate`)에는 타임아웃이 없었으므로 공통 `callGemini` 헬퍼로 뽑되, 타임아웃은 재생성 경로에만 건다.
- 실패 코드는 재설계 스펙이 `502`라 했으나, 기존 LLM 실패 경로가 전부 `ServiceUnavailableException`(**503**)이라 그쪽에 맞췄다.
- LLM은 **평문만** 반환한다(`CLAUDE.md` 규칙). ProseMirror 조립은 저장 시점에 한다. 프롬프트에 "수식은 평문, LaTeX/KaTeX 금지"를 명시했다.

### 8에서 확정한 것

- **`GET /questions/:id/stats`는 `@Public()`.** 전부 캐시 컬럼에서 읽고 `exam_session_answers`를 실시간 집계하지 않는다.
- **표본 임계값 10** (`STATS_MIN_SAMPLE`, §9-2의 미결을 이 값으로 확정). 표본 미달이면 `correctRate`/`avgTimeSpentSec`이 `null`.
- **정답률 표본(`totalSolvedCount`)과 시간 표본(`timedSolvedCount`)은 독립적으로 판정**한다(§7의 기준 차이 때문). 한쪽만 `null`일 수 있다.
- **선지 분포에는 임계값을 적용하지 않는다.** 비율이 아니라 개별 응답 수라 소수 표본이 오해를 만들지 않는다.
- **선지 순서·정답 여부의 단일 출처는 `questions.choices`(Json)**다. `question_choice_stats`는 `choiceId`만 알므로 서비스에서 조인한다. `choices`에 없는 `choiceId`(리셋 이후 잔재 등)는 버린다.
- **문제집 평균 점수는 macro 평균**(세션별 점수 %의 평균)이다. `attemptCount` + `scoreSumPercent`(Decimal)를 제출 시점에 누적하고, 응답에는 파생값 `avgScorePercent`만 노출한다(원시 합계는 감춘다). 응시 0회면 `0`이 아니라 `null`.
- **포크 사본은 원본의 응시 성적을 물려받지 않는다** (`attemptCount`/`scoreSumPercent` 기본값 0).

### 7에서 확정한 것

- **제출 시(`submit()`) 세 가지를 한 트랜잭션에서 갱신**한다: 정답률 카운터(기존), 시간 카운터, 선지 분포.
- **시간 카운터는 채점 여부와 무관하게** `timeSpentSec != null`인 답안만 집계한다. 정답률 카운터가 "채점된 문항"만 세는 것과 기준이 다르다 — 서술형은 `selfGrade()`에서 뒤늦게 채점되지만 시간은 제출 시점에 이미 기록되어 있기 때문이다. 따라서 `timedSolvedCount != totalSolvedCount`일 수 있다.
- **`selectedChoiceIds`는 `Json` 컬럼이라 런타임 형태를 신뢰하지 않는다.** `readChoiceIds()`가 문자열 배열만 통과시키고, **중복 선택은 한 번만 센다**(같은 선지를 두 번 담아 분포를 부풀리지 못하도록).
- **리셋은 `dto.choices !== undefined`로 판정**한다. 빈 배열(`[]`)도 리셋 대상이고, 발문·해설만 바꾸는 수정은 통계를 보존한다.
- 리셋은 `questionChoiceStat` 행 삭제 + `total/correctSolvedCount`, `total/timedTimeSpent` 카운터 0. **`exam_session_answers`와 `snapshot`은 손대지 않으므로 과거 응시 기록·채점 결과는 그대로다.**

### 4~6에서 확정한 것

- **`visibility`는 VARCHAR** (`"PRIVATE" | "PUBLIC"`). `questionType`과 같은 패턴으로 `WORKBOOK_VISIBILITIES` 상수가 단일 출처(`common/constants/question.ts`).
- **읽기 권한**: `PUBLIC`이거나 소유자여야 한다. 목록도 `OR: [{visibility:'PUBLIC'}, {ownerId}]`로 좁힌다.
- **담기 대상은 `PUBLISHED` 문항만.** 복합 PK `(workbookId, questionId)` 위반 시 `409 Conflict`("이미 담긴 문항입니다").
- **문제집 자체에는 분류가 없다.** 3단 분류 필터는 "그 분류의 문항을 하나라도 포함하는 문제집"으로 해석한다(교차 과목 허용의 필연적 귀결).
- **포크 사본은 항상 `PRIVATE`**, 제목은 `"<원본> (사본)"`. 문항은 복사하지 않고 참조만 옮기며 각 행의 `sourceWorkbookId`가 원본을 가리킨다. 원본의 `forkCount`를 같은 트랜잭션에서 증가시킨다.
- **`PRIVATE` → `PUBLIC` 최초 전환 시점**을 발행으로 보고 `publishedAt`을 기록한다.
- **`questionCount`는 캐시**다. 담기/빼기/생성/포크 모두 같은 트랜잭션 안에서 증감시킨다.

### 5에서 고친 조용한 버그

기존 플레이리스트 모드는 `subjectId`가 다른 문항을 **에러 없이 걸러내고** 짧은 시험을 만들었다(§3.1). 이제 과목 필터를 제거하고, 유효하지 않은 문항이 하나라도 있으면 **누락된 ID를 나열해 `400`으로 거부**한다.

`exam_sessions.subject_id`가 nullable이 되면서 `me.service.ts`의 `s.subject.name`이 깨진다. `subjectName`을 nullable로 바꾸고 `workbookId`/`workbookTitle`을 함께 노출하도록 수정했다(문제집 응시는 교차 과목이라 소분류가 없다).

### 1' — 2단계 절차 (프로덕션 배포 시)

`schema.prisma`의 `examType`은 현재 `@default("수능")`을 달고 있다. 기존 `subjects` 행이 있는 DB에 NOT NULL 컬럼을 추가하려면 default가 필요하기 때문이다(§1.4).

1. 배포 → `db push`가 기존 행을 `"수능"`으로 채운다
2. 실제 값으로 백필 (`npm run db:seed`가 `upsert`의 `update: { examType }`로 시드 행을 갱신한다)
3. `@default("수능")` 제거 → `db push`

**2단계를 건너뛰면** 신규 `subjects` 생성 시 `examType` 누락이 컴파일 타임에 잡히지 않고 조용히 `"수능"`으로 저장된다. `CreateSubjectDto.examType`이 `@IsNotEmpty()`라 API 경로는 막히지만 내부 코드 경로는 뚫려 있다.

### 12 — 재배열 / 바로 풀기 (완료)

**`PUT /workbooks/:id/questions/order`** — **전체 순서를 통째로** 받는다. 부분 이동은 동시 편집 시 순서가 어긋나도 서버가 검증할 수 없다. 넘어온 집합이 현재 문항 집합과 정확히 일치해야 하며, 누락·미포함·중복은 전부 `400`(무엇이 문제인지 ID를 나열해 알린다). `displayOrder`를 `0..n-1`로 다시 매긴다.

**`POST /workbooks/:id/start`** — 문제집을 `displayOrder` 순서로 세션에 싣는다. `WorkbooksModule`이 `ExamSessionsModule`을 import하고 `ExamSessionsService`를 주입한다(그래서 `exam-sessions.module.ts`에 `exports`를 추가했다).

여기에 §2.3의 필연적 귀결이 있다. **담기는 참조라서, 원저자가 문항을 `ARCHIVED` 처리하면 문제집에 죽은 문항이 남는다.**

- 세션 조립을 통째로 막으면 문제집 하나가 통으로 못 풀리게 된다.
- 조용히 버리면 §3.1에서 고친 바로 그 버그를 재현한다.

→ **발행된 문항으로만 세션을 만들되, 제외된 문항을 `skippedQuestionIds`로 응답에 명시한다.** 풀 수 있는 문항이 하나도 없으면 `400`. 사용자가 짧아진 시험의 이유를 알 수 있어야 한다.

### 실 DB 검증 (2026-07-09, TiDB Cloud)

`src/db-verify.spec.ts` — 목킹 없이 실제 Prisma/트랜잭션을 때린다. 기본 실행에서는 건너뛴다:

```bash
RUN_DB_TESTS=1 npx jest db-verify --runInBand
```

**14개 전부 통과.** 확인한 것:

- 포크 트랜잭션 — `forkCount` 증가, 사본은 `PRIVATE` + 성적 미상속, `sourceWorkbookId` 기록
- `Decimal` 증분 — `scoreSumPercent`
- 복합 키 upsert — `questionChoiceStat(questionId, choiceId)`
- `updateMany` 밀어내기 — 중간 삽입 시 `displayOrder` 중복 없음
- 복합 PK 충돌 → `409`
- **교차 과목 플레이리스트가 조용히 버려지지 않는다** (§3.1의 버그가 실제로 고쳐졌음)
- 미발행 문항 섞이면 `400`
- 제출 시 카운터 3종(정답률·시간·선지분포) 갱신
- `choices` 수정 → 통계 리셋, **`exam_session_answers` 원본은 보존**
- 소유자 조회는 `viewCount`를 올리지 않고, 응답 값이 1 뒤처지지 않음
- 재배열이 `displayOrder`를 `0..n-1`로 다시 매기고, 누락/미포함/중복은 `400`
- 바로 풀기가 `subjectId = null` 교차 과목 세션을 만들고, `ARCHIVED` 문항을 `skippedQuestionIds`로 명시

각 항목은 **변이 테스트로 확인**했다. `startSession`의 발행 필터를 제거하면 2개, 재배열의 집합 검증을 제거하면 1개가 실패한다.

테스트는 `dbv-` 접두사 행만 만들고 `afterAll`에서 전부 지운다. 실행 전후 행 수가 동일함을 확인했다(기존 `user` 1, `subject` 1 무손상).

### 검증 상태

- `prisma validate` **통과**, `prisma generate` **통과**, `npm run build`(tsc) **통과**, `npm test` **8/8 통과**.
- 리셋 규칙은 **변이 테스트로 검증**했다(`resetStats`를 `false`로 뒤집으면 2개 실패 → 테스트가 규칙을 실제로 붙잡고 있음).
- ⚠️ **엔드포인트 실행 검증은 못 했다.** 개발 머신에 Docker/MySQL이 없어 DB를 띄우지 못했다. 포크 트랜잭션, `questionCount` 증감, `409` 충돌, 제출 시 카운터 갱신은 **컴파일·단위 테스트까지만** 확인됐다.
- ⚠️ `npx prisma`는 **7.8.0**을 끌어온다. Prisma 7은 `datasource.url`을 금지해 검증이 실패한다. 반드시 로컬 `node_modules/.bin/prisma`를 쓸 것.
- ⚠️ `CLAUDE.md`가 안내하는 `npm run lint`는 **루트에 eslint 설정이 없어 실행 불가**하다(기존 저장소 문제).
- `exam_studio_db_seed_data.json`은 구 스키마 기준 문서용 샘플이며 **어떤 코드도 읽지 않는다**(292행에서 JSON 파싱도 깨진다). 갱신하지 않았다.
