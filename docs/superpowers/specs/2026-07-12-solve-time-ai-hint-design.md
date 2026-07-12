# 응시 중 AI 힌트 즉석 생성 — 설계

**작성일:** 2026-07-12
**상태:** 설계 승인 대기

## 배경 / 문제

응시 화면(`SolveQuestionCard`)에 "힌트" 버튼이 있고, 백엔드 `POST /exam-sessions/questions/:sessionQuestionId/hint`(`revealHint`)가 문항의 `question.hintContent`(plain text)를 반환한다. 그러나 `hintContent`를 채우는 경로가 **seed(50% 더미)뿐**이다:

- AI 생성(`ai-generation.processor`)은 `hintContent`를 만들지 않는다.
- 웹 에디터에 `hintContent` 입력 필드가 없다(web 코드의 `hintContent` 참조는 `types.ts` 타입 선언 하나뿐).

따라서 실사용 문항의 `hintContent`는 항상 null → 힌트 클릭 시 404 → 프론트가 `hintUnavailable=true`로 **버튼을 조용히 숨김**. 사용자 체감상 "힌트 기능 작동 안 함."

## 목표

응시자가 응시 도중 버튼을 눌러 **그 문항에 대한 AI 힌트를 즉석에서** 받는다. 힌트는 정답을 노출하지 않고 접근법·핵심 개념만 짚는 넛지다.

## 결정 사항 (확정)

| 축 | 결정 | 근거 |
|----|------|------|
| 저장 | **저장 안 함(휘발)** | 개인화·단순함. DB 스키마 변경 없음. |
| 호출 방식 | **동기(즉답)** | 응시 중 UX. 폴링 부적합. 단발 호출이라 짧음. |
| static hintContent | **있으면 우선** | 출제자 작성분 존중 + 비용 절약. 없을 때만 AI. |
| 호출 제한 | **문항당 1회(세션 메모리)** | 프론트가 이미 `hintText`를 상태로 들고 있어 재클릭 시 재호출 안 함. 비용 최소. |

## 아키텍처

기존 동기 인라인 LLM 경로인 `GeminiLlmService.regenerateChoices`를 본보기로 미러링한다. 그 메서드는 이미 (1) 짧은 타임아웃, (2) 일시 장애 자체 재시도, (3) 키 로테이션, (4) DB 미기록("후보만 반환")을 갖추고 있어 힌트에 그대로 맞다.

### 컴포넌트 1 — `GeminiLlmService.generateHint(ctx)` (신규)

- 시그니처: `generateHint(ctx: LlmHintContext): Promise<LlmHintResult>`
- 내부: `callGemini(buildHintSystemPrompt(), buildHintUserPrompt(ctx), { timeoutMs: 15_000, attempts: 3, disableThinking: true })`
- `callGemini`는 `responseMimeType: 'application/json'`을 강제하므로 산문이 아닌 **JSON `{"hint": string}`**로 받는다(`regenerateChoices`와 동일 계약). `parseHintResult`가 파싱·검증(빈 문자열이면 예외).
- `LlmHintContext`(→ `llm.types.ts`): `{ examType?, examCategory?, subjectName?, difficulty?, questionType, stemText, choices?: {content, isCorrect}[], correctAnswerText?, explanationText? }`
  - 모델이 좋은 힌트를 만들도록 **정답 정보를 컨텍스트에 넣되**, 시스템 프롬프트에서 "정답·선지 번호·정답 문자열을 힌트에 절대 노출하지 말라"고 지시한다.
- `LlmHintResult`: `{ hint: string }`

**시스템 프롬프트 골자:**
- 너는 한국 시험 문항의 풀이 코치다. 학생이 스스로 풀도록 방향만 제시하는 **힌트 1~2문장**을 만든다.
- 정답 선지 번호, 정답 텍스트, 정답을 직접 유추 가능한 문구를 절대 쓰지 않는다.
- 접근 방법, 주의할 함정, 떠올려야 할 개념/공식만 짚는다.
- JSON `{"hint": string}` 하나만 출력. 서두/코드펜스 금지. 한국어.

### 컴포넌트 2 — `ExamSessionsService.revealHint` 동작 변경

현재 흐름 유지(세션/소유자/IN_PROGRESS 검증, `isHintUsed`/`hintUsedAt` 기록)하되 힌트 소스만 교체:

```
sq 조회 시 select 확장: question { hintContent, questionType, stemText/stem, choices, correctAnswerText, explanationText, subject { name, examCategory, examType? } }
  (실제 필드명은 schema.prisma에 맞춘다. stem/choices는 ProseMirror JSON이므로 extractPlainText로 평문화해 LLM에 넘긴다.)

if (question.hintContent) {
  hint = question.hintContent            // 출제자 작성분 우선
} else {
  hint = (await geminiLlm.generateHint(ctx)).hint   // 없으면 AI 즉석
}
// isHintUsed/hintUsedAt 기록은 두 경로 공통으로 유지
return { sessionQuestionId, hint, isHintUsed: true, hintUsedAt }
```

- 반환 타입 계약(`RevealHintResult`)은 그대로. `hint: string`.
- 힌트 컨텍스트는 **스냅샷이 아니라 라이브 question**에서 가져온다(현재 코드도 그럼 — 채점 근거가 아니므로). stem/choices ProseMirror는 `extractPlainText`(`src/common/prosemirror/prosemirror.util.ts`)로 평문화.
- `GeminiLlmService`는 `AiGenerationModule`이 이미 export하므로, `ExamSessionsModule`에 `imports: [AiGenerationModule]`만 추가하면 주입된다(순환 참조 없음 — AiGeneration은 ExamSessions를 import하지 않음). 키 미설정 시 `generateHint`는 기존 `callGemini`가 `ServiceUnavailableException`을 던지고, 이는 프론트에서 에러 메시지로 처리된다.

### 컴포넌트 3 — `SolveQuestionCard` 프론트 수정

- 현재 `onError: () => setHintUnavailable(true)` → 버튼 숨김. 이걸 **에러 메시지 표시 + 버튼 유지(재시도 가능)**로 교체.
  - `hintUnavailable` 상태 제거, `hintError: string | null` 도입.
  - `onError: (e) => setHintError(e.message)`.
- 성공 경로(`hintText` 표시), `isPending` 스피너는 그대로 — AI 대기(실측 1~3초) 커버.
- `hintText`가 세션 메모리 역할(재클릭 시 이미 있으면 재호출 안 하도록 가드 추가: `if (hintText) return;`).

## 데이터 흐름

```
[버튼 클릭] → useRevealHint.mutate(sessionQuestionId)
  → POST /exam-sessions/questions/:id/hint
    → revealHint: 검증 → hintContent 있으면 반환 / 없으면 generateHint(평문화한 stem·choices·정답)
      → Gemini(JSON {"hint"}) → isHintUsed 기록 → { hint }
  → 성공: hintText 표시 / 실패: hintError 표시(버튼 유지)
```

## 에러 처리

- LLM 키 미설정 / 모든 키 소진(429) / 타임아웃: `callGemini`가 기존대로 예외 → 500/503/429 → 프론트 에러 메시지("힌트를 불러오지 못했어요. 다시 시도해 주세요.").
- 세션 미소유/제출됨: 기존 검증대로 403/400.
- 정답 노출은 프롬프트로만 억제(모델 준수 100% 보장 불가) — MVP 허용 범위.

## 테스트

- `GeminiLlmService.generateHint`: `callGemini`를 목킹해 JSON `{"hint":"..."}` → `{hint}` 파싱, 빈 hint면 예외.
- `ExamSessionsService.revealHint`: (1) static hintContent 있으면 LLM 미호출·그 값 반환, (2) 없으면 `generateHint` 호출·그 결과 반환, (3) 두 경로 모두 `isHintUsed` 기록, (4) 미소유/제출됨 예외. `geminiLlm`·`prisma`는 목.
- 프론트: 수동 검증(백엔드 붙여 힌트 버튼 클릭 → 표시, 에러 시 메시지·버튼 유지).

## 범위 밖 (YAGNI)

- 힌트 영구 저장·캐시(휘발 결정).
- 에디터/AI 생성의 hintContent 채우기(별도 작업 — 이번엔 응시 즉석 생성만).
- 힌트 사용 시 채점 감점/표시(이미 `isHintUsed` 기록만, 노출은 별건).
- 정답 노출 후처리 필터(프롬프트 억제로 충분한 MVP).

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/modules/ai-generation/llm/gemini-llm.service.ts` | `generateHint` + `buildHint*Prompt` + `parseHintResult` 추가 |
| `src/modules/ai-generation/llm/llm.types.ts` | `LlmHintContext`, `LlmHintResult` 추가 |
| `src/modules/exam-sessions/exam-sessions.service.ts` | `revealHint`에 AI 폴백 + `GeminiLlmService` 주입 |
| `src/modules/exam-sessions/exam-sessions.module.ts` | `imports: [AiGenerationModule]` 추가(GeminiLlmService 주입) |
| `web/components/exam-session/SolveQuestionCard.tsx` | 에러 시 버튼 숨김 → 메시지 표시, 재클릭 가드 |
| 테스트 | 위 서비스 2종 spec |
