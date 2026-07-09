# Q-Idea 문항 시각자료 (그래프·차트) 설계

날짜: 2026-07-10
상태: 승인 대기
범위: 백엔드. 프론트는 계약만 고정하고 구현은 별도.

## 목표

문항과 지문에 **그래프·차트**를 붙인다. AI 생성·수동 편집·시험 응시·AI 튜터 네 경로 모두에서 일관되게 동작한다.

대회 시연이 1차 목표다. 그래프가 화면에 뜨는 것까지가 성공 기준이다. 아래 §10의 비목표를 지킨다.

## 배경 — 왜 이 설계인가

이 리포에는 이미 같은 형태의 판단이 하나 있다. `CLAUDE.md`:

> LLM은 오직 **평문**만 요청받는다. 노드 트리를 만들지 않는다.
> `prosemirror.util.ts`가 *모든* 조립을 소유한다.

시각자료도 같은 규칙을 따른다. **LLM은 데이터만 만들고, 조립은 서버가 한다.**

그리고 `docs/superpowers/specs/2026-07-09-qidea-frontend-redesign.md` §1.1이 이미 금지한 것이 있다:

> ❌ LLM이 Vega 스펙 JSON을 생성 → 클라에서 실행. `VizRenderer`, `sanitizeSvg` 전부 만들지 않는다.

이번 설계는 그 금지를 우회하지 않는다. LLM은 렌더 가능한 어떤 것도 만들지 않는다.

`prisma/schema.prisma`의 `MediaAssetType`에는 `IMAGE`만 남아 있고 주석에 "GRAPH_CODE/SVG는 제거"라 적혀 있다. **그 결정을 되돌리는 것이 아니다.** 되돌아오는 것은 코드 문자열이 아니라 선언적 데이터다.

---

## 1. 두 렌더러

| renderer | 용도 | 라이브러리 |
| --- | --- | --- |
| `"chartjs"` | 통계 차트 — 막대·꺾은선·원·산점도 | `chart.js` + `chartjs-plugin-datalabels` |
| `"jsxgraph"` | 함수 그래프·기하 도형 | `jsxgraph` |

**`renderer`는 행에 명시 저장한다.** `subjectId`에서 파생하지 않는다.

이유: 수학 과목에도 통계 자료가 나온다(확률과통계의 도수분포·상대도수 막대그래프). `examCategory === '수학'`이면 무조건 JSXGraph로 몰면 막대그래프를 기하 라이브러리로 그리게 된다. 또한 저장된 행만으로 렌더할 수 있어야 한다 — 렌더할 때마다 `subjects`를 조인하는 것은 AI 튜터·스냅샷 경로에서 특히 나쁘다.

과목은 **LLM 프롬프트 편향에만** 쓴다:

- `examCategory === '수학'` → "기본은 `jsxgraph`. 단 통계 자료(도수분포·상대도수)면 `chartjs`."
- 그 외 → "`chartjs`만."

LLM이 고른 `renderer`를 서버가 화이트리스트로 검증하고 그대로 저장한다. 과목으로 되파생하지 않는다. 출제자는 에디터에서 뒤집을 수 있다.

---

## 2. 스키마 — 테이블 추가만

프로덕션은 `prisma db push --skip-generate --accept-data-loss`로 배포된다(`railway.json`). 컬럼 삭제·타입 변경은 데이터 손실 경로다. **이 설계는 테이블 1개 추가 + nullable 컬럼 1개 추가뿐이다. 데이터 손실 0.**

```prisma
model QuestionVisual {
  id           String   @id @default(uuid()) @db.Char(36)
  questionId   String?  @map("question_id") @db.Char(36)
  passageId    String?  @map("passage_id") @db.Char(36)
  renderer     String   @db.VarChar(16)   // "chartjs" | "jsxgraph"
  spec         Json                        // 저작용 데이터. 렌더 config 아님.
  caption      String?  @db.VarChar(255)
  altText      String   @db.VarChar(500)  // 접근성 + AI 튜터의 유일한 통로
  displayOrder Int      @default(0) @map("display_order")
  createdAt    DateTime @default(now()) @map("created_at")

  question Question? @relation(fields: [questionId], references: [id], onDelete: Cascade)
  passage  Passage?  @relation(fields: [passageId], references: [id], onDelete: Cascade)

  @@index([questionId])
  @@index([passageId])
  @@map("question_visuals")
}
```

`AiGeneration`에 추가:

```prisma
  warnings Json?   // [{ code, questionIndex?, detail }] — §6 참조
```

### 불변식

- `questionId` XOR `passageId` — 정확히 하나만 NOT NULL. `MediaAsset`과 같은 배타 규칙이고, `media.service.ts`처럼 앱단에서 `BadRequestException`으로 검증한다(DB CHECK에 의존하지 않는다).
- `renderer`는 enum이 아니라 VARCHAR다. `questionType`과 같은 패턴 — 허용값의 단일 진실 소스는 `src/common/constants/visual.ts`의 `VISUAL_RENDERERS`. DTO는 `@IsIn(VISUAL_RENDERERS)`로 검증한다.
- `altText`는 NOT NULL이다. Gemini 스트리밍은 텍스트 전용이라 그림을 못 본다. `altText`(또는 그것을 만드는 `describeVisual`)가 AI 튜터가 시각자료를 아는 유일한 통로다.

`MediaAsset`은 건드리지 않는다. 업로드된 이미지와 선언적 시각자료는 다른 것이다. 한 테이블이 두 의미를 가지면 모든 읽기 코드가 분기해야 한다.

---

## 3. `spec` — LLM이 만드는 것

`src/common/visual/visual.types.ts`가 소유한다.

```ts
// renderer: "chartjs"
export interface ChartJsSpec {
  kind: 'bar' | 'line' | 'pie' | 'scatter';
  labels: string[];
  datasets: { label: string; data: number[] }[];
  xTitle?: string;
  yTitle?: string;
}

// renderer: "jsxgraph"
export interface JsxGraphSpec {
  boundingBox: [number, number, number, number];  // [xMin, yMax, xMax, yMin]
  elements: JsxGraphElement[];
}

export interface JsxGraphElement {
  type: 'point' | 'line' | 'functiongraph' | 'circle' | 'segment' | 'text';
  parents: (number | string)[];   // 숫자, 또는 함수식 문자열("x^2")
  label?: string;
}
```

`elements[].type`은 **화이트리스트**다. `attrs`는 없다 — 스타일은 LLM이 정하지 않는다.

`parents`의 문자열은 함수식만 허용한다. 서버가 파서로 검증하고, 프론트는 안전한 수식 평가기로 돈다. **`eval` / `new Function`을 쓰지 않는다.**

### 왜 LLM에게 `renderPlan`을 직접 만들게 하지 않는가

구조체로 뱉으면 실행 안전성 자체는 확보된다(코드 문자열이 아니므로). 그럼에도 `spec` 계층을 두는 이유는 넷이다.

1. **데이터 레이블 보장이 무너진다.** 요구사항은 "문항에 삽입되는 그래프·차트는 전부 데이터 레이블이 있어야 한다"이다. LLM이 `attrs`를 쓰면 가끔 빼먹는다. 가끔이 더 나쁘다 — 검수를 통과해 배포된다. 서버 조립기가 무조건 켜면 누락이 구조적으로 불가능해진다.
2. **검증 표면이 라이브러리 API 전체가 된다.** `spec`은 필드 6개라 검증기가 짧다. `renderPlan`을 LLM이 만들면 Chart.js·JSXGraph API 전부가 입력이다. 충분히 큰 스펙 언어는 그 자체로 실행 환경이다 — 이것이 §1.1이 Vega를 금지한 이유와 같다.
3. **편집 왕복이 안 된다.** 조립은 손실 변환이다. 막대 하나의 값을 고치려면 `spec`에선 `datasets[0].data[2]` 하나지만, `renderPlan`에선 그 숫자가 데이터 포인트·미리 계산된 레이블 문자열·축 범위 세 곳에 흩어진다. `PATCH /visuals/:id`가 받을 것이 없어진다.
4. **API 버전 드리프트.** LLM은 학습 데이터의 Chart.js v2/v3 옵션을 쓴다. `spec`은 우리가 정의한 6필드라 버전이 없다. 라이브러리를 올릴 때 조립기 파일 하나만 고친다.

핵심: **`spec`은 저작 언어, `renderPlan`은 렌더 언어다.** LLM을 저작 언어에 묶는 것이 이 설계의 값어치 전부다.

---

## 4. 조립 — `src/common/visual/visual.util.ts`

`prosemirror.util.ts`와 대칭이다. 이 파일이 시각자료 조립을 *전부* 소유한다.

```ts
validateVisualSpec(renderer: string, spec: unknown): ChartJsSpec | JsxGraphSpec
buildRenderPlan(renderer: string, spec: ChartJsSpec | JsxGraphSpec): RenderPlan
describeVisual(renderer: string, spec: ChartJsSpec | JsxGraphSpec): string
```

### `validateVisualSpec`

`renderer` 화이트리스트. `kind`/`type` 화이트리스트. 숫자 유한성(`Number.isFinite`). 배열 길이 일치(`labels.length === datasets[i].data.length`). 요소 개수 상한. 함수식 문자열은 허용 토큰(`x`, 숫자, `+ - * / ^ ( )`, `sin cos tan sqrt abs log`)만 통과.

실패 시 던진다. 던진 예외를 어떻게 다루는지는 호출자가 결정한다(§5는 400, §6은 경고).

### `buildRenderPlan`

**출력에 함수가 하나도 없다.** 순수 JSON이다.

이것이 이 설계에서 가장 조용히 중요한 제약이다. Chart.js의 자연스러운 config는 콜백을 담는다 — `datalabels.formatter`, `scales.y.ticks.callback`. 그것을 그대로 내려보내려면 문자열로 싸서 프론트가 `new Function`으로 풀어야 하고, 그 순간 §1.1이 막은 임의 JS 실행이 뒷문으로 돌아온다.

그래서 조립기가 **콜백이 계산했을 값을 미리 계산해 박는다.** 각 데이터 포인트의 레이블 문자열, 축 tick 문자열 배열. 결과 config에 함수가 남지 않는다.

JSXGraph에는 애초에 직렬화할 "config 객체"가 없다 — `board.create(type, parents, attrs)` 명령의 나열이다. 그래서 렌더 플랜은 평탄 배열이다:

```ts
type RenderPlan =
  | { renderer: 'chartjs';  config: ChartJsConfig }              // 함수 0개
  | { renderer: 'jsxgraph'; boundingBox: [number,number,number,number];
      elements: { type: string; parents: unknown[]; attrs: Record<string, unknown> }[] };
```

프론트는 `for (const e of plan.elements) board.create(e.type, e.parents, e.attrs)` 루프를 돈다. 규칙이 없으므로 서버와 갈라질 것이 없다. **프론트는 조립기가 아니라 해석기다.**

`datalabels` 플러그인 옵션은 여기서 무조건 켠다. `chartjs` 렌더 플랜은 레이블 없이 나올 수 없다.

### `describeVisual`

평문 요약을 만든다.

```
"막대그래프. x축 연도, y축 인구(만명). 값: 2020년 51.8, 2021년 51.7, 2022년 51.6."
```

세 곳에서 재사용한다 — `altText` 자동 생성, AI 튜터 컨텍스트(§8), `search_text` 캐시. 한 곳에서 만들고 세 곳이 쓴다.

---

## 5. 문제 에디팅 — 엔드포인트 3개

```
POST   /questions/:id/visuals    시각자료 추가
PATCH  /visuals/:id              spec / caption 수정
DELETE /visuals/:id              삭제
```

`@Roles(CREATOR)`. 셋 다 `validateVisualSpec` 통과 필수 — 실패 시 400에 한국어 메시지.

`altText`를 클라가 보내지 않으면 서버가 `describeVisual`로 채운다. 보내면 그것을 쓴다.

지문에 붙이는 경로는 `POST /passages/:id/visuals`로 대칭 추가한다. **네 라우트 모두 `visuals.controller.ts`가 소유한다** — `questions`/`passages` 컨트롤러는 건드리지 않는다. `questionId` XOR `passageId` 불변식은 서비스가 지킨다.

### 읽기 응답

`GET /questions/:id`에 추가:

```ts
visuals: {
  id: string;
  renderer: 'chartjs' | 'jsxgraph';
  spec: ChartJsSpec | JsxGraphSpec;   // 편집용
  renderPlan: RenderPlan;             // 렌더용. 프론트는 이것을 만들지 않는다.
  caption: string | null;
  altText: string;
  displayOrder: number;
}[]
```

`spec`과 `renderPlan`을 **둘 다** 내려보낸다. 조립기는 여전히 서버 하나뿐이다 — 프론트는 `renderPlan`을 소비만 하고 생성하지 않는다. `spec`은 에디터의 폼 바인딩용이다. `spec`은 레이블 배열과 숫자 배열이라 작다.

---

## 6. AI 생성 — 비동기 계약 유지

`llm.types.ts`에 추가:

```ts
export interface LlmVisual {
  renderer: 'chartjs' | 'jsxgraph';
  spec: unknown;          // validateVisualSpec 통과 전이므로 unknown
  caption?: string;
}
```

`LlmQuestion.visuals?: LlmVisual[]`, `LlmGenerationResult.passage.visuals?: LlmVisual[]`.

`AiGenerationProcessor`의 계약은 그대로다 — 멱등성(행이 `PENDING`이 아니면 스킵), 성공 시 단일 `$transaction` 커밋, 실패 시 재던져 BullMQ 재시도. `questionVisual.createMany`가 같은 트랜잭션에 들어간다.

### 검증 실패 정책 — 항상 경고. `FAILED`로 떨구지 않는다.

시각자료가 `validateVisualSpec`을 통과하지 못하면 **그 시각자료만 버리고 문항은 살린다.** `ai_generations.warnings`에 기록한다:

```json
[{ "code": "VISUAL_VALIDATION_FAILED", "questionIndex": 2, "detail": "labels.length !== data.length" }]
```

`GET /ai-generations/:id`가 `warnings`를 함께 반환한다.

"시각자료가 문제 성립에 필수면 `FAILED`" 라는 갈래는 **만들지 않는다.** 이유:

- **필수 여부를 신뢰성 있게 판정할 주체가 없다.** LLM이 `visualRequired`를 자기 신고하면, 시각자료를 망친 바로 그 LLM이 그 플래그도 쓴다. 발문에서 `"다음 그래프"` 같은 표현을 정규식으로 잡는 것은 한국어 표현이 열 가지라 조용히 틀린다.
- **사람 게이트가 이미 있다.** AI 생성 결과는 `DRAFT`로 떨어진다. 자동 발행되지 않는다. 발문이 "다음 그래프를 보고"인데 그래프가 없으면 출제자 눈에 즉시 보인다.
- **`FAILED`는 비싸고 무의미하다.** 프로세서는 실패 시 재던지고 BullMQ가 백오프로 재시도한다. 시각자료 하나 때문에 문항 10개 배치를 지우고 Gemini를 세 번 더 부른다. 재시도해도 같은 LLM이 같은 실수를 한다.

자동 발행이 생기면 그때 `visualRequired`를 다시 검토한다. 지금은 YAGNI다.

---

## 7. 시험 세션 — 스냅샷에 포함, 마스킹하지 않음

`exam_session_questions.snapshot`은 문항을 통째로 복사한다. 채점도 스냅샷을 쓴다. **`visuals`도 스냅샷에 들어가야 한다.** 그러지 않으면 출제자가 나중에 그래프를 고쳤을 때 이미 응시한 시험의 문제가 바뀐다 — 스냅샷 구조가 존재하는 이유가 바로 그것을 막기 위해서다.

스냅샷에는 `renderPlan`까지 굳혀 넣는다. 조립기 버전이 올라가도 과거 시험의 그림이 변하지 않는다.

`maskSnapshot`은 `visuals`를 지우지 않는다. 시각자료는 정답이 아니라 발문의 일부다. `spec`에 정답 표시가 없으므로(선지·`correctAnswerText`와 무관) 마스킹 대상이 아니다.

---

## 8. AI 튜터 — 시각자료를 텍스트로 본다

`tutor.service.ts`는 이미 인가 3단계(세션 소유자 / `IN_PROGRESS` / 문항 귀속)를 통과한 뒤 스냅샷을 마스킹 없이 읽는다. 그 경로에 `visuals`를 얹는다.

각 시각자료를 `describeVisual()`로 평문 변환해 프롬프트에 넣는다. **`<answer_context>` 블록 밖에 넣는다** — 시각자료는 숨길 정답이 아니라 학생도 보고 있는 문제의 일부다.

Gemini 스트리밍은 텍스트 전용이라 그림을 못 본다. `describeVisual`이 유일한 통로다.

`tutor.prompt.ts`에 한 줄 추가:

> 시각자료의 수치를 읽어 개념 설명에 활용하되, 그 수치로부터 정답 선지를 지목하지 마라.

기존 튜터 계약은 그대로다 — 정답을 말하지 않고, 기초 개념 → 이 문제와의 연결 → 다음 행동 하나 + 확인 질문 순으로 답한다.

---

## 9. 프론트 계약 (이번 스코프 밖)

- `web/package.json`에 `chart.js`, `chartjs-plugin-datalabels`, `jsxgraph` 추가.
- `react-vega`는 **통계 위젯 전용으로 남는다**(선지별 오답 분포 등). 시각자료 렌더러가 아니다. `2026-07-09-qidea-frontend-redesign.md` §1.1의 금지는 그대로 유효하다.
- 프론트는 `renderPlan`을 소비만 한다. 만들지 않는다. `spec`은 에디터 폼 바인딩에만 쓴다.
- `eval` / `new Function` 금지. `renderPlan`에 함수가 없으므로 필요도 없다.

---

## 10. 비목표 (대회 시연 범위)

- **인터랙티브 JSXGraph 요소 없음.** 드래그 가능한 점, 슬라이더, 애니메이션. 정적 렌더만.
- **시각자료 재생성 엔드포인트 없음.** 오답 선지 재생성(`POST /questions/:id/choices/regenerate`)과 짝이 되는 시각자료 버전은 만들지 않는다. 출제자가 `PATCH /visuals/:id`로 고친다.
- **시각자료 검색 없음.** `search_text`에 `describeVisual` 결과를 넣는 것은 이번에 하지 않는다.
- **`MediaAsset`과의 통합 없음.** 이미지와 시각자료는 별도 배열로 내려간다.
- **`visualRequired` / `FAILED` 갈래 없음.** §6 참조.

---

## 11. 테스트

- `validateVisualSpec`: 화이트리스트 밖 `renderer`/`kind`/`type` → 던짐. `labels.length !== data.length` → 던짐. `NaN`/`Infinity` → 던짐. 함수식에 허용 토큰 밖 문자(`;`, `=>`, `constructor`) → 던짐.
- `buildRenderPlan`: **출력을 순회해 `typeof v === 'function'`인 값이 하나도 없음을 단언한다.** `chartjs` 플랜에 `datalabels` 옵션이 항상 켜져 있음을 단언한다.
- `describeVisual`: 모든 데이터 포인트의 값이 문자열에 나타남.
- 서비스: `questionId`와 `passageId`를 둘 다 주면 400, 둘 다 안 주면 400.
- 프로세서: 시각자료 하나가 검증 실패해도 문항이 생성되고 `warnings`에 기록됨. 상태는 `COMPLETED`.
- 스냅샷: 시각자료를 포함하고, 원본 `QuestionVisual`을 수정해도 스냅샷이 안 바뀜.
- 튜터: 프롬프트에 `describeVisual` 결과가 들어가고 `<answer_context>` 밖에 있음.

## 12. 파일

```
prisma/schema.prisma                          QuestionVisual 추가, AiGeneration.warnings 추가
src/common/constants/visual.ts                신규 — VISUAL_RENDERERS, CHART_KINDS, JSX_ELEMENT_TYPES
src/common/visual/visual.types.ts             신규
src/common/visual/visual.util.ts              신규 — validate / buildRenderPlan / describeVisual
src/common/visual/visual.util.spec.ts         신규
src/modules/visuals/visuals.module.ts         신규 — CRUD 3개
src/modules/visuals/visuals.controller.ts     신규
src/modules/visuals/visuals.service.ts        신규
src/modules/visuals/dto/*.ts                  신규
src/modules/ai-generation/llm/llm.types.ts    LlmVisual 추가
src/modules/ai-generation/llm/gemini-llm.service.ts   시스템 프롬프트에 spec 계약 추가
src/modules/ai-generation/ai-generation.processor.ts  createMany + warnings
src/modules/questions/questions.service.ts    읽기 응답에 visuals
src/modules/exam-sessions/exam-sessions.service.ts    스냅샷에 visuals
src/modules/tutor/tutor.service.ts            컨텍스트에 describeVisual
src/modules/tutor/tutor.prompt.ts             한 줄 추가
src/app.module.ts                             VisualsModule 등록
```

## 13. 열린 사항

- `spec`의 데이터 포인트 개수 상한, `elements` 개수 상한을 정하지 않았다. 구현 시 각각 50 / 30으로 두고 필요하면 조정한다.
- 함수식 파서를 직접 쓸지 라이브러리(예: `mathjs`의 `parse`)를 쓸지 결정하지 않았다. 직접 쓰면 의존성이 없고, 라이브러리를 쓰면 표현력이 는다. 시연 범위에서는 직접 쓰는 쪽이 검증 표면이 작다.
