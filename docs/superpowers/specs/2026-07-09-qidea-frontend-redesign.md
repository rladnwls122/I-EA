# Q-Idea 프론트엔드 재설계 — 3-Section Layout + 출제/분석 맥락 분리

- 작성일: 2026-07-09
- 대체 대상: `specs/2026-07-06-qidea-frontend-mvp-design.md`, `plans/2026-07-06-qidea-frontend-mvp.md` (Task 8·9·10 폐기)
- 근거 코드: `prisma/schema.prisma`, `src/common/constants/question.ts`, `src/modules/*/​*.controller.ts`, `CLAUDE.md`
- 참고 서비스: solves-ai.com/workbooks/new, questi.kr, quizmeter.app

---

## 0. 이 문서가 하는 일

요구서(2026-07-09)를 기존 백엔드 계약에 맞춰 번역하고, **백엔드가 없는 기능을 명시적으로 분리**한다.
요구서의 필드명 일부는 실제 스키마에 존재하지 않는다. 아래 §1 매핑표를 단일 출처로 삼고, 요구서 원문의 필드명(`is_public`, `units`, `steps`, `search_logs`)은 코드에 쓰지 않는다.

---

## 1. 요구서 ↔ 백엔드 계약 매핑 (필독)

| # | 요구서 표현 | 실제 백엔드 | 프론트 처리 |
| --- | --- | --- | --- |
| 1 | 단원 선택 콤보박스 | `units` 테이블 없음. `subjects.examCategory` = 대분류(국어/수학), `subjects.name` = 세부과목(문학/언매) | `GET /subjects` 1회 호출 → 클라에서 `examCategory` 그룹핑. **2단계 셀렉트**(대분류 → 세부과목). `UnitTreeSelect` 금지 |
| 2 | `questions.is_public: false` 임시저장 | 컬럼 없음. `QuestionStatus = DRAFT \| IN_REVIEW \| PUBLISHED \| ARCHIVED` | AI 초안 = `DRAFT`(생성 시 기본값). 발행 = `POST /questions/:id/publish` |
| 3 | 1~8지선다 | `questions.choices`는 `Json?` — 개수 제약 없음. `questionType`은 `"객관식" \| "주관식"` 2종뿐 | 지선다 개수는 **유형이 아니라 배열 길이**. 프론트 zod로 2~8 검증 |
| 4 | 선지별 오답 분포 차트 | `exam_session_answers.selectedChoiceIds`(Json)는 있으나 **집계 API 없음** | 백엔드 신규 필요 → §6 Task B1 |
| 5 | 평균 풀이 시간 대비 내 기록 | `exam_session_answers.timeSpentSec` 존재. 집계 API 없음 | 위와 동일 엔드포인트에 포함 |
| 6 | `search_logs` 기반 인기 검색어 | **테이블 자체가 없음** | 신규 테이블+API. §6 Task B3. **컷라인 후보 1순위** |
| 7 | "사용자들이 만든 문제집에서 문제를 집어감" | `workbooks` 엔티티 없음 | ⚠️ 미결. §2 참조 |
| 8 | AI 단계별 풀이 해설 `steps` 아코디언 | `questions.explanation`은 단일 ProseMirror JSON | LLM은 평문만 반환(`CLAUDE.md` 규칙). `buildRichBlocks`가 `\n` 기준 분리 → **최상위 `paragraph` 노드 = 1 step**으로 렌더 |
| 9 | 인라인 AI 오답 선지 재생성 | 엔드포인트 없음. 기존 `POST /ai-generations`는 BullMQ **비동기 배치** | 동기 엔드포인트 신규 필요 → §6 Task B2 |
| 10 | KaTeX 전면 제외 | `web/package.json`에 `katex@0.17` 존재 | 의존성 제거. `MathText` 컴포넌트 만들지 않음 |
| 11 | `react-vega` 통계 차트 | 의존성 존재 | **유지하되 용도 재정의** → §5.3 |

### 1.1 react-vega 용도 재정의 (중요)

이전 스펙은 "AI Vega/SVG 자동 시각화 제거"였다. 이번 요구서의 `react-vega`는 **완전히 다른 용도**다.

- ❌ 금지(이전에 폐기된 것): LLM이 Vega 스펙 JSON을 생성 → 클라에서 실행. `app/api/ai/visualize/route.ts`, `VizRenderer`, `sanitizeSvg` **전부 만들지 않는다**.
- ✅ 허용(이번 요구서): 스펙은 **프론트 소스에 하드코딩**하고, `data.values`에만 `GET /questions/:id/stats` 응답을 바인딩한다. LLM은 관여하지 않는다.

이 구분을 지키면 "임의 JS 실행 금지" 원칙과 충돌하지 않는다.

---

## 2. ⚠️ 결정 필요: 문제집(Workbook) 엔티티

요구서는 `/workbook/create`와 "사용자들이 만든 문제집에서 문제를 집어 새 문제집 구성"을 요구하지만, **DB에 문제집 개념이 없다**. 현재 문항을 묶는 유일한 축은 `ai_generations`(생성 배치)와 `exam_sessions`(응시 세션)다.

세 가지 선택지:

**(A) 라우트명만 차용 — 백엔드 변경 0** ← 권장
`/workbook/create`는 실제로 "AI 생성 배치 하나"를 만든다. `POST /ai-generations` → `generationId`가 곧 문제집 ID. 문항 재조합은 기존 `POST /exam-sessions { questionIds }`(수동 플레이리스트, 이미 구현됨)로 처리.
→ 요구서의 UI를 100% 그릴 수 있고, "문제집 발행"은 배치 내 문항 일괄 `publish`.

**(B) 최소 `workbooks` 테이블 신설**
`workbooks(id, ownerId, title, description, isPublic)` + `workbook_questions(workbookId, questionId, order)` M:N. 문제집 탐색/포크가 진짜로 동작. 백엔드 2~3일 추가.

**(C) 이번 스코프에서 문제집 탐색 제외**
`/workbook/create`는 출제 관문으로만 쓰고, "남의 문제집에서 문제 집어오기"는 다음 마일스톤.

> **이 문서의 나머지는 (A)를 전제로 작성한다.** (B)를 택하면 §4.1의 데이터 흐름만 교체하면 되고 UI는 동일하다.

---

## 3. 디자인 시스템 (Solves AI 스타일 프리미엄 다크)

### 3.1 토큰

다크 단일 테마. `next-themes`의 `defaultTheme="dark"` + `forcedTheme="dark"`로 고정하고, `globals.css`의 라이트 블록은 남겨두되 사용하지 않는다.

```css
.dark {
  --background:       #060709;  /* 심해색 배경 */
  --card:             #111318;  /* 카드·표면 */
  --surface-raised:   #171A21;  /* 호버·활성 표면 (요구서 미지정, 파생) */
  --border:           #222630;  /* 은은한 경계선 */
  --foreground:       #E8EAED;
  --muted-foreground: #717684;  /* 뮤트된 메타 텍스트 */

  --primary:          #5865F2;  /* 일렉트릭 인디고 블루 */
  --primary-foreground: #FFFFFF;
  --purple:           #8B5CF6;  /* AI 포인트 */

  --correct:          #22C55E;  /* 정답 */
  --wrong:            #EF4444;  /* 오답 */
}
```

`tailwind.config.ts`의 `colors`에 `purple`, `correct`, `wrong`, `surface-raised`를 `var(--*)`로 추가한다. 기존 oklch 값들은 hex로 교체.

파생 규칙 (요구서에 없어 여기서 확정):
- "연한 그린 배경" = `bg-correct/12` + `text-correct` + `border-correct/30`
- "연한 레드 배경" = `bg-wrong/12` + `text-wrong` + `line-through decoration-wrong/60`
- AI 관련 액션(오답 선지 재생성, 스마트 생성)만 `--purple`. 나머지 CTA·활성 상태는 `--primary`.

### 3.2 인터랙션 (요구서 명시 요구)

모든 인터랙티브 요소는 **호버 시 시각 피드백이 필수**다. 임의로 정하지 말고 아래 3종만 사용한다.

| 요소 | 기본 | 호버 | 활성/선택 |
| --- | --- | --- | --- |
| 카드 | `border-border bg-card` | `border-primary/40 bg-surface-raised` | `border-primary ring-1 ring-primary/30` |
| 아이콘 버튼(사이드바) | `text-muted-foreground` | `text-foreground bg-surface-raised` | `text-primary bg-primary/10` + 좌측 2px 인디케이터 바 |
| 선지 버튼 | `border-border` | `border-primary/50` | `border-primary bg-primary/10` |

전환은 `transition-colors duration-150`. 스케일 변환(`hover:scale-*`)은 쓰지 않는다 — 텍스트 렌더가 흐려진다.

---

## 4. 3-Section Layout

```text
┌──┬───────────────────────────────────────┬──────────────────┐
│🏠│                                       │                  │
│📝│            메인 콘텐츠                  │  컨텍스트 사이드바 │
│📊│                                       │  (오답노트에서만)  │
│⚙️│                                       │                  │
└──┴───────────────────────────────────────┴──────────────────┘
 64px            1fr                          320px
```

- `components/layout/AppSidebar.tsx` — 64px 고정, 아이콘 전용(`lucide-react`). 툴팁으로 라벨. 활성 탭은 §3.2 규칙.
- 우측 사이드바는 **레이아웃이 아니라 라우트별 슬롯**이다. Next App Router의 [Parallel Routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes)(`@sidebar`) 사용 → 오답노트 세그먼트에만 `@sidebar/page.tsx`를 두면 다른 라우트에서 자동으로 렌더되지 않는다. 조건부 `if (pathname.startsWith('/notes'))` 분기 금지.

### 4.1 라우트 구조

```text
web/app/
  layout.tsx                    ← AppSidebar + Providers
  page.tsx                      ← 🏠 홈 (문제 탐색 + 검색)
  workbook/create/page.tsx      ← 📝 2-Track 관문
  studio/editor/page.tsx        ← 출제 에디터 (?questionId= 로 초안 로드)
  notes/
    layout.tsx                  ← 2컬럼 (main + @sidebar)
    page.tsx                    ← 📊 오답노트 대시보드
    [questionId]/
      page.tsx                  ← 복습 뷰 (채점 상태 + 해설 + Q&A)
      @sidebar/page.tsx         ← 통계 위젯 (여기서만 존재)
  settings/page.tsx             ← ⚙️
  questions/[id]/page.tsx       ← 일반 문제 상세 (통계 위젯 없음)
  exam/...                      ← 기존 유지
```

**맥락 분리 규칙:** 통계 위젯은 `notes/[questionId]/@sidebar`에만 존재한다. `questions/[id]`(풀이 전 탐색)와 `studio/editor`(출제 중)에서는 파일이 존재하지 않으므로 노출될 수 없다.

---

## 5. 화면별 설계

### 5.1 `/workbook/create` — 2-Track 관문

**상단: 분류 선택 (요구서 이미지 기준)**

3단 진행형 셀렉터. 대분류 선택 → 나머지 대분류가 사라지고 세부과목 칩 목록이 펼쳐짐 → 마지막 칩 뒤에 빨간 `카테고리 취소` 버튼.

```text
[ 시험 카테고리 ▾ ]  →  [ 국어 ]  [문학] [언매] [화작] ... [ ✕ 취소 ]
                          ↑선택된 대분류만 잔류
```

- 데이터: `GET /subjects` 단일 호출. 응답을 `groupBy(examCategory)`.
- 상태: `useState<{ category?: string; subjectId?: string }>`. URL 동기화 불필요(폼 로컬).
- 선택 완료 시에만 하단 2-Track 카드를 `opacity-100`으로 활성화. 미선택 시 `opacity-40 pointer-events-none`.

**하단: 2-Track 대형 카드**

| 카드 | 내용 | 액션 |
| --- | --- | --- |
| 🤖 AI 스마트 생성 | 주제 `Textarea`, 세부과목(상단에서 상속, 읽기전용 표시), 난이도 1~5, 문항 수 | `POST /ai-generations` → 202 → 폴링 |
| ✍️ 직접 출제 에디터 | 설명 문구만 | `router.push('/studio/editor')` (쿼리 없음 = 빈 폼) |

카드 hover는 §3.2 카드 규칙. AI 카드만 테두리 그라디언트에 `--purple` 섞음.

**AI 생성 대기 런타임 UI**

전체 차단 모달 금지. 생성 버튼 클릭 즉시:

1. 요청한 문항 수만큼 `<Skeleton>` 카드를 하단 리스트에 즉시 렌더.
2. Shimmer는 Tailwind 커스텀 keyframe으로:
   ```js
   // tailwind.config.ts theme.extend
   keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
   animation: { shimmer: 'shimmer 1.8s infinite' },
   ```
   `<div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />`
3. `useGenerationPolling(genId)` — 3초 간격, `status === 'COMPLETED' | 'FAILED'`에서 정지.

> ⚠️ **점진적 렌더링(Hydration)은 불가능하다.** 요구서는 "문항이 하나씩 생겨남"을 요구하지만, 백엔드 `AiGenerationProcessor`는 문항 전체를 **단일 `$transaction`으로 커밋**한다(`CLAUDE.md`). 중간 상태를 읽을 방법이 없다.
> → 정직한 구현: `COMPLETED` 수신 시 스켈레톤을 카드로 **80ms stagger 교체**(`transition-delay: index * 80ms`). 시각적으로는 순차 등장이되, 진행률을 꾸며내지 않는다.
> → 진짜 스트리밍이 필요하면 백엔드에 SSE + 문항별 커밋이 선행되어야 하며, 이는 이번 스코프 밖이다.

**브릿지 CTA**

각 문항 카드 우측 상단 `[✏️ 이 문제 정밀 편집]` → `/studio/editor?questionId=<id>`.
초안은 이미 `DRAFT` 상태로 DB에 존재하므로 별도 임시저장 호출이 없다.

### 5.2 `/studio/editor` — 출제 스튜디오

**데이터 바인딩**

`?questionId=` 있으면 `GET /questions/:id` → 폼 초기화:

| 폼 필드 | 소스 | 변환 |
| --- | --- | --- |
| 지문/발문 | `question.stem` (ProseMirror JSON) | Tiptap `editor.commands.setContent(stem)` — **평문 변환 금지**, JSON 그대로 |
| 선지 배열 | `question.choices` | `choices.map(c => extractPlainText(c.content))` → `Input[]` |
| 정답 번호 | `choices.findIndex(c => c.isCorrect)` | `RadioGroup` value |
| 해설 | `question.explanation` | Tiptap 또는 `Textarea`(평문) |

저장 시 역변환: 평문 → `buildRichDoc`. **프론트에도 `web/lib/prosemirror.ts`를 두고 백엔드 `src/common/prosemirror/prosemirror.util.ts`와 동일 규약**(`\n` 분리)을 유지한다. 두 파일이 갈라지면 저장 포맷이 깨지므로, 프론트 유틸 상단에 백엔드 파일 경로를 주석으로 명시한다.

**수식(KaTeX) 전면 제외**

- `npm rm katex` (`web/`).
- 수식은 순수 텍스트: `x^2 - 2x = 0`, `f'(2)`. 렌더러 없음. `$...$` 파싱도 하지 않는다.
- Tiptap 확장은 `StarterKit`만. `Mathematics`/`katex` 노드 추가 금지.
- 에디터 하단에 `수식은 x^2, f'(x) 형태의 일반 텍스트로 입력하세요` 헬퍼 텍스트 고정 노출.

**인라인 AI 오답 선지 재생성**

```text
[🤖 AI 오답 선지 자동 생성]   ← --purple, 에디터 하단
```

1. 현재 Tiptap 에디터의 `stem`을 `extractPlainText`로 평문화.
2. `POST /questions/:id/choices/regenerate` (신규, §6 Task B2) body `{ stemText, choiceCount, correctChoiceText }`.
3. 응답 `{ distractors: string[] }` → **정답 선지는 보존하고 오답 선지 배열만 교체**. 정답 인덱스는 유지.
4. 교체 전 `AlertDialog`로 확인 — 사용자가 손으로 쓴 오답이 날아가는 파괴적 동작이다.
5. 실패 시 토스트만, 기존 선지 유지.

**발행**

`POST /questions/:id/publish` → `status: PUBLISHED`. 성공 시 `/workbook/create` 리스트로 복귀하며 해당 카드에 `발행됨` 뱃지.

### 5.3 `/notes/[questionId]` — 복습 뷰 + 통계 위젯

**중앙 메인**

- 내가 고른 오답 선지: `bg-wrong/12 border-wrong/30 line-through decoration-wrong/60`
- 실제 정답 선지: `bg-correct/12 border-correct/30`
- 둘 다 아닌 선지: 기본
- 정답을 맞힌 경우: 정답 선지만 그린, 취소선 없음

해설 아코디언(`steps`):
`question.explanation.content` 배열에서 최상위 `paragraph` 노드를 순회 → 각 노드가 1 step. `Step 1`, `Step 2` 라벨을 프론트가 붙인다. 백엔드에 `steps` 필드를 추가하지 않는다.

**우측 위젯 1 — 선지별 오답 분포 (react-vega)**

데이터: `GET /questions/:id/stats` → `choiceDistribution: { index: number; count: number; isCorrect: boolean }[]`

Vega-Lite 스펙은 **소스에 하드코딩**:

```ts
const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  background: 'transparent',
  width: 'container',
  height: { step: 28 },
  mark: { type: 'bar', cornerRadiusEnd: 4 },
  encoding: {
    y: { field: 'label', type: 'nominal', axis: { labelColor: '#717684', domain: false, ticks: false, title: null } },
    x: { field: 'count', type: 'quantitative', axis: null },
    color: {
      field: 'kind', type: 'nominal',
      scale: { domain: ['correct', 'wrong', 'idle'], range: ['#22C55E', '#EF4444', '#2A2F3A'] },
      legend: null,
    },
  },
  config: { view: { stroke: null }, axis: { grid: false } },
};
```

- `kind`는 프론트에서 파생: 정답 선지 → `correct`, 내가 고른 오답 → `wrong`, 나머지 → `idle`(차콜).
- `<VegaLite spec={spec} data={{ table: rows }} actions={false} renderer="svg" />`
- 표본이 적으면 오해를 부른다. `totalSolved < 10`이면 차트 대신 `아직 통계가 충분하지 않습니다 (n=3)` 안내.

**우측 위젯 2 — 풀이 시간 속도 뱃지**

```
내 기록 42초  ·  평균 68초     [ 평균보다 38% 빠름 ]  ← bg-correct/15 text-correct
```
- `mySpent <= avg` → 초록, 초과 → 빨강. `avg === null`(표본 부족)이면 뱃지 미노출.
- 비율은 `Math.round((1 - mySpent / avg) * 100)`.

**하단 Q&A 트리**

`GET /questions/:id/comments` → flat 배열. `parentCommentId`로 클라에서 트리 조립.

```ts
// depth 상한 3. 초과분은 depth 3에 평탄화하고 "↳ @닉네임" 접두.
// 무한 들여쓰기는 모바일에서 본문 폭을 0으로 만든다.
```
- 들여쓰기: `pl-6` per depth. 수직 라인 = `border-l border-border`.
- 정렬: `createdAt asc`. 백엔드는 `@@index([questionId, createdAt])` 보유.

### 5.4 🏠 홈 — 검색 중심

요구서: "검색 자체에 포커스, 기존 작업과 이어지는 걸 표시, 인기 검색어 패널은 포커스 시 노출"

- 중앙 대형 `Input`. `onFocus` → 하단에 `인기 검색어` + `최근 본 문제` 패널 슬라이드 다운. `onBlur`(150ms 지연) → 닫힘.
- **인기 검색어는 `search_logs`가 없어 현재 구현 불가.** §6 Task B3 완료 전까지는 `최근 본 문제`(localStorage)만 노출하고 인기 검색어 슬롯은 렌더하지 않는다. **더미 데이터를 넣지 않는다.**

---

## 6. 백엔드 선행 작업 (프론트 블로커)

프론트 §5.3, §5.2를 구현하려면 아래가 먼저 있어야 한다.

**Task B1 — `GET /questions/:id/stats` (`@Public`)**
```ts
{
  totalSolved: number;
  correctRate: number | null;          // totalSolved < 10 이면 null
  avgTimeSpentSec: number | null;      // 표본 < 10 이면 null
  choiceDistribution: { index: number; count: number; isCorrect: boolean }[];
}
```
집계원: `exam_session_answers` join `exam_session_questions` where `question_id = :id` and `exam_sessions.status = 'SUBMITTED'`.
`selectedChoiceIds`는 `Json` 배열이므로 앱단에서 집계한다(MySQL JSON 함수 의존 금지 — TiDB 호환성).
`avgTimeSpentSec`은 `timeSpentSec IS NOT NULL`인 행만 평균.

**Task B2 — `POST /questions/:id/choices/regenerate` (`@Roles(CREATOR)`)**
기존 `POST /ai-generations`는 BullMQ 비동기라 인라인 UX에 못 쓴다. `GeminiLlmService`를 **동기 호출**하는 얇은 엔드포인트를 추가한다.
body `{ stemText: string; correctChoiceText: string; choiceCount: 2~8 }` → `{ distractors: string[] }`.
LLM은 **평문 배열만** 반환한다(`CLAUDE.md`의 "LLM은 노드 트리를 만들지 않는다" 규칙 준수). ProseMirror 조립은 프론트 저장 시점 또는 `PATCH /questions/:id`에서 `buildRichDoc`으로.
타임아웃 10초, 실패 시 502.

**Task B3 — `search_logs` + `GET /search/trending` (`@Public`)** — *컷라인 후보*
신규 테이블 `search_logs(id, userId?, keyword, createdAt)` + `GET /questions` 호출 시 `q` 파라미터 기록.
`GET /search/trending?window=7d` → `{ keyword, count }[]` top 10.
이게 없으면 §5.4의 인기 검색어 패널만 빠지고 나머지는 정상 동작한다.

---

## 7. 폐기 목록

새 코드에서 만들지 않는다:

- `UnitTreeSelect` — units 테이블 없음 (§1-1)
- `VizRenderer`, `sanitizeSvg`, `app/api/ai/visualize/route.ts` — LLM 생성 시각화 (§1.1)
- `MathText`, `katex` 의존성, `katex/dist/katex.min.css` import (§5.2)
- `VariantShell` — question_variants 제거됨
- 댓글 핀(`isPinned`) — 컬럼 제거됨
- 전체 화면 차단 생성 모달 (§5.1)
- 진행률 % 표시 — 백엔드가 진행률을 모른다 (§5.1)

기존 계획 문서의 Task 8(VizRenderer+KaTeX), Task 9(AI 시각화 Route Handler)는 **삭제**한다. Task 10(SketchCanvas)은 이번 요구서에 없으므로 보류.

---

## 8. 구현 순서

| 순서 | 작업 | 선행 |
| --- | --- | --- |
| 1 | 디자인 토큰 이식 (`globals.css`, `tailwind.config.ts`), `katex` 제거 | — |
| 2 | `AppSidebar` + 루트 `layout.tsx` 3-Section | 1 |
| 3 | `/workbook/create` 분류 셀렉터 + 2-Track 카드 | 2, `GET /subjects` |
| 4 | 생성 폴링 + Skeleton/Shimmer + stagger 교체 | 3 |
| 5 | `/studio/editor` 폼 바인딩 (`?questionId=`) + 발행 | 3 |
| 6 | **[BE] Task B2** → 인라인 오답 선지 재생성 | 5 |
| 7 | **[BE] Task B1** → `/notes/[questionId]` 채점 뷰 + Q&A 트리 | 2 |
| 8 | 통계 위젯 2종 (`@sidebar` parallel route) | 7 |
| 9 | 🏠 홈 검색 (인기 검색어 슬롯 제외) | 2 |
| 10 | **[BE] Task B3** → 인기 검색어 패널 | 9 |

6·7의 백엔드 작업이 프론트를 블록한다. 병렬로 시작할 것.

---

## 9. 미결 사항

1. **§2 문제집 엔티티** — (A)/(B)/(C) 중 선택 필요. 현재 문서는 (A) 전제.
2. **표본 임계값 10** — `totalSolved < 10`에서 통계를 숨기는 기준은 §5.3에서 임의로 정했다. 제품 판단 필요.
3. **오답 선지 재생성 시 정답 보존** — 요구서는 "오답 선지 배열만 부분 갱신"이라 했으나, 정답까지 바꿀지(=문항 전면 재구성) 여부가 불명확. 현재 문서는 정답 보존 전제.
