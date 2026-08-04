# 수식 렌더링 파이프라인 조사 — 수학·과탐 확장 (issue #35)

- 날짜: 2026-08-04
- 질문: 수학·과학탐구 과목으로 확장할 때 수식(LaTeX)을 어떻게 저장·생성·렌더링할 것인가?
  전제 제약: 콘텐츠는 Tiptap/ProseMirror JSON(MySQL `Json` 컬럼), LLM(Gemini)은 **평문만** 반환,
  노드 트리 조립은 `src/common/prosemirror/prosemirror.util.ts`가 소유.

## TL;DR — 핵심 결론

1. **공식 `@tiptap/extension-mathematics` + KaTeX 조합을 채택하면 된다.** web/은 이미 Tiptap **v3**(^3.27.2)과 `katex`(^0.17.0)를 의존성으로 갖고 있어(코드에서는 아직 미사용) 궁합이 정확히 맞는다. 이 확장은 `inlineMath`/`blockMath`라는 **atom 노드 2종에 `latex` 문자열 attr 하나**만 추가하는 구조라, 기존 JSON 저장 모델을 전혀 흔들지 않는다.
2. **"LLM은 평문만" 계약은 그대로 유지 가능하다.** LLM에게는 `$...$`(인라인)/`$$...$$`(블록) 델리미터가 든 평문을 요구하고, `buildRichDoc`/`buildRichBlocks`가 조립 시점에 델리미터를 파싱해 math 노드로 승격시킨다. 승격 전 서버에서 `katex.renderToString(..., { throwOnError: true })`로 파스 검증하고, 실패하면 평문 그대로 두는 **안전한 강등**이 가능하다.
3. **양쪽 `extractPlainText`를 반드시 락스텝으로 확장해야 한다.** math 노드는 atom이라 `text`가 없어 현행 구현에서는 **수식이 통째로 증발**한다(search_text, 튜터 프롬프트, 응시 화면 평문화 모두). `inlineMath` → `$latex$` 역직렬화를 백엔드 `prosemirror.util.ts`와 프런트 `web/lib/prosemirror.ts`에 **동시에** 넣어야 한다 — 프런트의 평문 오프셋은 주석(annotation) 앵커의 전제라 한쪽만 바꾸면 앵커가 어긋난다.
4. **저장 화이트리스트(`prosemirror.sanitize.ts`)에 노드 추가가 필수다.** `inlineMath: ['latex']`, `blockMath: ['latex']`를 넣지 않으면 저장이 400으로 막힌다(파일 상단 주석이 예고한 그 지점). `latex` attr은 KaTeX가 렌더하므로 HTML 주입면이 아니다(KaTeX `trust` 기본값 false 유지).
5. **스냅샷·마스킹·채점 흐름은 무영향이다.** 모두 JSON을 필드 단위로 다루므로 수식 노드는 그대로 통과한다. 단, 주관식 수학 단답 자동채점(문자열 정규화 비교)은 `$\frac12$` vs `0.5` 같은 동치 판정을 못 하므로 **수학 주관식은 당분간 서술형(자기채점)으로 유도**하고 동치 채점은 별도 과제로 유예한다.

---

## 1. 생태계 조사 — 어떤 확장/렌더러를 쓸 것인가

### 1.1 공식 확장: `@tiptap/extension-mathematics` (권장)

- 최신 버전 **3.29.2** (npm, 2026-08 기준). peer deps: `katex ^0.16.4 || ^0.17.0`, `@tiptap/core`·`@tiptap/pm`는 **동일 버전 정확 고정**(3.29.2) — Tiptap v3 모노레포 정책상 `@tiptap/*` 패키지들은 같은 버전으로 맞춰 설치해야 한다. web/의 `^3.27.2` 캐럿 범위와 호환.
- 설치: `npm install @tiptap/extension-mathematics katex` + `import 'katex/dist/katex.min.css'` (KaTeX 스타일시트 필수).
  출처: [Tiptap Mathematics 공식 문서](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
- **노드 구조** (GitHub 소스 `packages/extension-mathematics/src/extensions/InlineMath.ts`·`BlockMath.ts`에서 직접 확인):
  - `InlineMath`: `name: 'inlineMath'`, `group: 'inline'`, `inline: true`, **`atom: true`**, attrs `{ latex: string }` (HTML 직렬화 시 `data-latex`).
  - `BlockMath`: `name: 'blockMath'`, `group: 'block'`, **`atom: true`**, attrs `{ latex: string }`.
  - 저장 JSON 예: `{ "type": "inlineMath", "attrs": { "latex": "x^2+y^2=z^2" } }` — 자식 노드 없음.
- 명령: `insertInlineMath / updateInlineMath / deleteInlineMath` 및 block 대응 3종. 옵션: `inlineOptions.onClick`/`blockOptions.onClick`(수식 클릭 → 편집 다이얼로그), `katexOptions`(`throwOnError`, `macros` 등 [KaTeX 옵션](https://katex.org/docs/options.html) 그대로 전달).
- **`migrateMathStrings` 유틸 내장**: 텍스트 노드 안의 `$...$` 문자열을 `inlineMath` 노드로 일괄 승격한다. 사용 정규식(소스 `utils.ts`):

  ```
  /\$(?!\d+\$)(.+?)\$(?!\d)/g
  ```

  `$100` 같은 통화 표기는 잡지 않도록 숫자 인접 케이스를 배제한다. **이 정규식을 우리 백엔드 토크나이저의 기준 규칙으로 그대로 차용하는 것을 권장** — 에디터 마이그레이션 유틸과 서버 조립 로직이 같은 델리미터 문법을 공유하게 된다.

### 1.2 대안 (비권장, 기록용)

| 패키지 | 상태 | 판단 |
|---|---|---|
| [`@aarkue/tiptap-math-extension`](https://github.com/aarkue/tiptap-math-extension) | 커뮤니티, decoration 기반 `$` 인식 | 공식 확장 등장 전의 대안. 공식이 노드 기반이라 JSON 저장 모델에 더 적합 |
| [`prosemirror-math`](https://www.npmjs.com/package/prosemirror-math) (benrbray) | 0.2.2, 저활동 | Tiptap 래핑 없이 ProseMirror 직접 사용 — 통합 비용만 크다 |
| [`buttondown/tiptap-math`](https://github.com/buttondown/tiptap-math) | 소규모 | 공식 확장으로 충분 |

### 1.3 KaTeX vs MathJax

- **KaTeX** (현재 npm 최신 0.18.1, MIT): 동기 렌더, 경량, **Node.js 서버 사이드 렌더 공식 지원**([katex.org/docs/node](https://katex.org/docs/node)) — 우리의 "서버에서 파스 검증" 요구에 정확히 부합. LaTeX의 부분집합만 지원([support table](https://katex.org/docs/support_table.html)) — 고교 수학·과탐 수식 범위에는 충분.
- **MathJax v4** (2025 릴리스, [공지](https://www.mathjax.org/MathJax-v4.0.0-available/)): 인라인 수식 자동 줄바꿈, ARIA 기반 접근성 탐색기 등 커버리지·접근성 우위. 그러나 무겁고 비동기 렌더 모델이며, **Tiptap 공식 확장이 KaTeX를 peer로 못 박고 있다.**
- **결론: KaTeX.** 에디터 통합이 결정 요인이다. 접근성 요구(스크린리더 수식 낭독)가 명시 요구사항이 되는 시점에 MathJax 병행을 재검토한다. web/package.json의 `katex ^0.17.0`은 확장의 peer 범위(`^0.16.4 || ^0.17.0`) 안이므로 그대로 둔다 (0.18로 올리면 peer 범위를 벗어난다).

### 1.4 주의: 티켓 전제 교정

이슈/티켓은 "Tiptap 2 호환"을 물었지만, **web/은 이미 Tiptap v3**(`@tiptap/react ^3.27.2`, StarterKit v3)다. 공식 Mathematics 확장은 v3 라인이므로 호환 문제가 없고, 오히려 v2였다면 커뮤니티 확장에 의존해야 했을 것이다. 백엔드 sanitize 화이트리스트 주석도 "Tiptap v3 StarterKit 기준"이라고 명시하고 있다.

---

## 2. "LLM은 평문만" 계약 유지 방안

### 2.1 델리미터 규약

- LLM 출력 계약(`src/modules/ai-generation/llm/llm.types.ts`)은 그대로 문자열 필드(`stemText`/`choices[].content`/`explanationText`...)를 유지한다. **JSON 스키마 변경 없음.**
- `GeminiLlmService`의 시스템 프롬프트에 규칙 한 줄만 추가한다: *"수식은 반드시 `$...$`(인라인) 또는 `$$...$$`(별행)로 감싼 LaTeX로 쓴다. 유니코드 수학 기호를 흉내내지 않는다."* Gemini 계열은 기본적으로 `$` 델리미터 LaTeX를 잘 방출하므로 프롬프트 비용이 낮다.
- 델리미터 문법은 공식 확장의 `mathMigrationRegex`(§1.1)와 동일 규칙을 채택한다. `\( \)`/`\[ \]` 관용도 존재하지만, 확장 내장 유틸과 규칙을 공유하는 `$` 계열로 통일하는 편이 유지보수가 싸다.

### 2.2 `buildRichDoc` / `buildRichBlocks` 확장 (백엔드 `prosemirror.util.ts`)

현행: `\n` 분리 → 각 줄을 `paragraph > text` 하나로. 확장안:

1. 문단 전체가 `$$...$$` 하나면 → `{ type: 'blockMath', attrs: { latex } }` 블록 노드로.
2. 문단 내부를 `mathMigrationRegex`로 스캔해 `text` run과 `{ type: 'inlineMath', attrs: { latex } }`를 교차 배열로.
3. **각 latex 후보를 `katex.renderToString(latex, { throwOnError: true })`로 파스 검증** — `ParseError`가 나면 승격하지 않고 원문 텍스트 그대로 둔다(LLM 출력 드리프트에 대한 안전한 강등, 기존 철학과 동일). KaTeX는 Node에서 공식 지원되므로([문서](https://katex.org/docs/node)) NestJS 프로세서 안에서 바로 돌릴 수 있다. `katex`를 **백엔드 루트 package.json에도 추가**해야 한다 (현재는 web/에만 있음).
4. 수식이 전혀 없는 텍스트는 현행과 바이트 단위로 동일한 출력 — 국어·영어 등 기존 과목의 저장물에는 어떤 변화도 없다.

### 2.3 `extractPlainText` 라운드트립 — 가장 중요한 함정

math 노드는 **atom이라 `text`도 `content`도 없다.** 현행 `extractPlainText`(백엔드·프런트 모두)는 이를 조용히 건너뛴다. 즉 확장 없이 math 노드를 도입하면:

- `questions.search_text` 캐시에서 수식이 사라져 검색 불능 (`questions.service.ts:405`, `ai-generation.processor.ts:175`)
- 튜터 프롬프트에서 발문의 수식이 증발 (`src/modules/tutor/tutor.prompt.ts`)
- 응시 세션 평문화에서 수식 증발 (`exam-sessions.service.ts:364-385`)

**해법: 두 파일의 `extractPlainText`에 math 노드 분기를 추가**해 `inlineMath` → `` `$latex$` ``, `blockMath` → `` `$$latex$$` ``로 역직렬화한다. 이러면 `buildRichDoc(extractPlainText(doc))`가 수식 보존 라운드트립이 되고, 튜터/재생성 경로에서 LLM에게 도로 평문을 줄 때도 수식이 살아 있다.

**락스텝 경고:** `web/lib/prosemirror.ts`의 `visitTextNodes`는 `extractPlainText`와 `walkTextSegments`가 같은 순회를 쓰게 하는 단일 출처이고, 그 평문 오프셋이 **주석(annotation) 앵커 모델의 전제**다(파일 주석에 명시). 백엔드만 고치고 프런트를 안 고치면 수식 포함 문항에서 앵커 오프셋이 어긋난다. 다행히 수학·과탐은 신규 과목이라 기존 annotation 데이터와의 충돌은 사실상 없다 — 도입 시점에 양쪽을 한 커밋으로 맞추면 된다.

### 2.4 저장 검증 (`prosemirror.sanitize.ts`)

- `ALLOWED_NODES`에 `inlineMath: ['latex']`, `blockMath: ['latex']` 추가. 파일 주석의 규칙("에디터에 확장을 추가하면 여기도 같이 넓혀야 한다 — 안 넓히면 저장이 400") 그대로다.
- `latex` attr 값은 원시 문자열 강제(`pickAttrs`가 이미 보장). 렌더 경로가 `katex.render`이므로 `dangerouslySetInnerHTML`류 주입면이 아니며, KaTeX 자체의 `trust` 옵션 기본값 false가 `\href`·`\htmlClass` 등 위험 명령을 차단한다([KaTeX options](https://katex.org/docs/options.html)) — `katexOptions.trust`는 켜지 않는다.
- 저장 시점에 latex 파스 검증까지 할지는 선택 사항: 렌더 측 `throwOnError: false`가 깨진 수식을 빨간 원문으로 보여주므로(안전), 화이트리스트 통과만으로 충분하다.

---

## 3. web/ 렌더링 영향

### 3.1 읽기 전용 화면 (응시·오답노트·문항 상세)

현행 읽기 화면(`QuestionArticle.tsx`, `SolveQuestionCard.tsx` 등)은 `extractPlainText` 결과를 `<p>`에 뿌린다 — 수식은 이 방식으로는 `$...$` 원문 문자열로 보인다(깨지진 않지만 렌더가 아니다). 선택지:

- **권장: `@tiptap/static-renderer`(v3, 3.29.2)의 `renderToReactElement`** — 에디터 인스턴스 없이 JSON → React 엘리먼트. `nodeMapping`으로 `inlineMath`/`blockMath`를 `katex.renderToString` 출력으로 매핑한다. 공유 `<QuestionRichText doc={...} />` 컴포넌트 하나를 신설해 읽기 화면들이 `extractPlainText` 직접 호출을 이것으로 교체하게 한다. 출처: [Static Renderer 문서](https://tiptap.dev/docs/editor/api/utilities/static-renderer)
- 차선: 자체 재귀 렌더러(현 `visitTextNodes` 확장) — 의존성은 없지만 StarterKit 노드(리스트·표 등)가 늘수록 직접 유지 비용 증가.

**SSR 관련:** KaTeX의 `renderToString`은 DOM API를 쓰지 않아 **SSR 안전**하다(Vega처럼 `next/dynamic` + `ssr: false` 격리가 필요 없다). 필요한 것은 (a) `katex/dist/katex.min.css` import(전역 또는 해당 컴포넌트)와 (b) KaTeX 웹폰트가 번들에 실리는 것뿐. CSS+폰트만큼 번들이 커지므로 수식이 나오는 라우트에서만 import하는 것도 고려.

### 3.2 에디터 (`web/components/editor/TiptapEditor.tsx`)

- `extensions: [StarterKit, Mathematics.configure({ katexOptions: { throwOnError: false }, inlineOptions: { onClick: ... } })]` 추가 + `katex.min.css` import.
- Tiptap v3에서 Next.js SSR 시 `useEditor({ immediatelyRender: false })`가 hydration mismatch 방지의 공식 처방이다([Tiptap Next.js 설치 문서](https://tiptap.dev/docs/editor/getting-started/install/nextjs)). 현행 `TiptapEditor.tsx`에는 이 옵션이 없다 — math 도입과 무관하게 지금도 잠재 이슈이므로 함께 넣는다.
- 작가 UX: `onClick` → LaTeX 입력 다이얼로그(공식 문서 패턴), 필요 시 `migrateMathStrings`를 `onCreate`에서 실행해 `$` 타이핑 관용을 지원.

### 3.3 스냅샷·마스킹·채점 — 무영향 확인

- `exam_session_questions.snapshot`은 문항 JSON을 통째 복사 → math 노드도 그대로 복사된다.
- `maskSnapshot`은 `isCorrect`/`correctAnswerText`/`explanation` **필드 단위** 제거라 stem/choices 내부의 노드 타입과 무관 — 무영향.
- 채점(`grading.util.ts`): 객관식 선택 ID 집합 비교라 무영향. **주관식 단답 자동채점만 주의** — 정규화 문자열 비교는 `\frac{1}{2}`/`1/2`/`0.5`의 수학적 동치를 판정할 수 없다. 수학 주관식은 (a) 당분간 `correctAnswerText` 없이 서술형(자기채점)으로 운영하거나, (b) CAS 기반 동치 판정(웹에 이미 있는 `mathjs` 활용 가능)을 **별도 티켓으로 유예**한다.

---

## 4. 인접 특수 콘텐츠 — 무엇을 미룰 것인가

| 항목 | 방안 | 판단 |
|---|---|---|
| **표** | `@tiptap/extension-table` 3.29.2 (v3는 `TableKit`으로 4개 노드 일괄 등록) | 작가 수동 입력용으로는 sanitize에 `table/tableRow/tableHeader/tableCell`(+`colspan/rowspan/colwidth`) 추가로 끝. 단 **LLM 평문 계약과 정면 충돌**(평문 한 필드로 표 구조를 실어 나를 수 없음) — LLM 생성 표는 유예, 에디터 수동 입력만 2단계로 |
| **화학식 (mhchem)** | `import 'katex/contrib/mhchem'` 한 줄로 `\ce{...}` 지원 — 별도 노드 불필요, `inlineMath`에 그대로 들어감. 서버 검증 시에도 동일하게 require 후 `renderToString` 동작 ([KaTeX #2168](https://github.com/KaTeX/KaTeX/issues/2168)) | **과탐 확장 시 즉시 포함 권장** (비용이 거의 0) |
| 물리 회로도·그래프/함수 플롯 | 기존 media(이미지 S3) 경로 | 유예 — MVP 원칙(이미지만) 유지 |
| MathJax 병행(접근성) | 수식 스크린리더 낭독 요구 발생 시 | 유예 |
| 수학 단답 동치 채점 | `mathjs` 등 CAS 비교 | 유예 (별도 티켓 권장, §3.3) |

---

## 부록 A. 구현 시 수정 지점 체크리스트

| 파일 | 변경 |
|---|---|
| 루트 `package.json` | `katex` 추가 (서버 파스 검증용) |
| `src/common/prosemirror/prosemirror.util.ts` | `$` 토크나이저(+KaTeX 파스체크) → math 노드 조립, `extractPlainText`에 `$latex$` 역직렬화 |
| `src/common/prosemirror/prosemirror.sanitize.ts` | `ALLOWED_NODES` += `inlineMath/blockMath: ['latex']` |
| `src/modules/ai-generation/llm/gemini-llm.service.ts` | 시스템 프롬프트에 `$...$` LaTeX 규칙 추가 |
| `web/package.json` | `@tiptap/extension-mathematics` 추가 (Tiptap 버전과 동일 버전으로; `katex`는 이미 있음) |
| `web/lib/prosemirror.ts` | `visitTextNodes`/`extractPlainText`/`walkTextSegments`에 math 분기 — **백엔드와 같은 커밋으로** |
| `web/components/editor/TiptapEditor.tsx` | `Mathematics` 확장 등록, `immediatelyRender: false`, KaTeX CSS |
| 신규 `web/components/.../QuestionRichText.tsx` | static-renderer 기반 읽기 렌더러 — `extractPlainText` 직출력 화면들을 순차 교체 |

## 부록 B. 출처

- Tiptap Mathematics 확장 문서: https://tiptap.dev/docs/editor/extensions/nodes/mathematics
- Tiptap Mathematics 소스 (노드명·attrs·마이그레이션 정규식 직접 확인): https://github.com/ueberdosis/tiptap/tree/main/packages/extension-mathematics/src
- Tiptap Static Renderer: https://tiptap.dev/docs/editor/api/utilities/static-renderer
- Tiptap Next.js 설치 가이드 (`immediatelyRender: false`): https://tiptap.dev/docs/editor/getting-started/install/nextjs
- KaTeX Node.js 지원: https://katex.org/docs/node · 옵션(`trust`/`throwOnError`): https://katex.org/docs/options.html · 지원 명령 표: https://katex.org/docs/support_table.html
- KaTeX mhchem 서버 사이드: https://github.com/KaTeX/KaTeX/issues/2168
- MathJax v4 공지: https://www.mathjax.org/MathJax-v4.0.0-available/
- npm 메타데이터 (버전·peer deps): `npm view @tiptap/extension-mathematics`, `npm view katex` (2026-08-04 조회: extension 3.29.2, katex 0.18.1/MIT)
- 대안 확장: https://github.com/aarkue/tiptap-math-extension · https://www.npmjs.com/package/prosemirror-math · https://github.com/buttondown/tiptap-math
- 사내 코드 근거: `src/common/prosemirror/prosemirror.util.ts`, `src/common/prosemirror/prosemirror.sanitize.ts`, `src/modules/ai-generation/llm/llm.types.ts`, `src/modules/ai-generation/ai-generation.processor.ts`, `src/modules/exam-sessions/exam-sessions.service.ts`, `src/modules/tutor/tutor.prompt.ts`, `web/lib/prosemirror.ts`, `web/components/editor/TiptapEditor.tsx`, `web/package.json`
