# 대화형 출제 캔버스 (Conversational Authoring Canvas)

**작성일**: 2026-07-12
**상태**: 설계 승인됨 (구현 대기)

## 배경 / 문제

현재 AI 출제는 두 화면에 흩어져 있고 모두 **단발성**이다.

- `/workbook/create` (`WorkbookBuilder`): 과목 선택 → 단발성 채팅 패널 → 생성 문항 자동 담기.
- `/studio/editor` (`QuestionEditor`): 좌 편집기 + 우 단발성 채팅 + 미리보기→적용.

AI가 이전 대화를 기억하지 못해 "한 문제씩 신중히 소통하며" 만들 수 없다. 되묻기·맥락 유지·기존 문항 수정 요청이 불가능하다.

목표: **좌측 문제집 캔버스 + 우측 멀티턴 채팅**의 ChatGPT-canvas 형 협업 UI. AI가 대화 맥락을 기억하고, 한 문제 또는 여러 문제를 생성해 채팅에 내놓으면, 사용자가 버튼으로 좌측 캔버스에 담는다.

## 범위

**포함**
- `/workbook/create` → 과목 선택 후 새 `/edit` 캔버스로 이동하는 흐름.
- `/edit` 캔버스: 좌 문제집 카드(수동 Tiptap 편집 유지) + 우 멀티턴 채팅.
- 백엔드 멀티턴 출제 채팅 (SSE 스트리밍 + Redis 히스토리) — tutor 모듈 패턴 각색.
- AI가 1개 또는 여러 개 문항을 채팅에서 제시 → 개별/일괄 "추가", 기존 카드 "교체".

**제외 (나중/불필요)**
- 모바일 반응형 — 별도 트랙, 나중에 별도 스펙.
- Tiptap 선택→텍스트 범위 교체 — 복붙으로 충분.
- 필드별 refine 버튼 — 멀티턴 채팅이 수정을 흡수하므로 불필요.
- 새 LLM provider — Gemini only 유지.

## 아키텍처

### 흐름

```
/workbook/create
  Step 1 과목 선택(다중) → 문제집 생성(createWorkbook)
  → router.push(`/edit?workbookId=<id>`)

/edit?workbookId=<id>  (신규 캔버스 페이지)
  ├─ 좌: 문제집 캔버스
  │    - 편집 가능 제목 + 과목 뱃지
  │    - 문항 카드 목록 (Tiptap 수동 편집 — 기존 QuestionEditor 카드 재사용)
  │    - "+" 수동 문항 추가
  │    - 하단 저장 툴바 (기존 handleSave 로직 재사용)
  └─ 우: 멀티턴 채팅
       - 스레드(기억 O), 스트리밍 델타 렌더
       - AI가 문항 제시 → "추가/교체" 버튼 → 좌측 카드 반영
```

라우트는 `/edit?workbookId=<id>` 로 신설한다. 캔버스 내부는 기존 `QuestionEditor`의 카드/저장 로직을 재사용하되 우측 패널을 멀티턴 채팅으로 교체한다. 기존 `/studio/editor` 는 남겨두거나(하위 호환) `/edit` 로 리다이렉트 — 구현 계획에서 확정.

### 백엔드 — 멀티턴 출제 채팅 (추가 1개)

**엔드포인트**: `POST /ai-generations/chat` (SSE, tutor 컨트롤러와 동일 패턴: `@Post + @Res()` 로 스트림 직접 종료).

**요청 DTO** (`AuthoringChatDto`):
- `workbookId: string` — 히스토리 키 + 컨텍스트.
- `message: string` — 이번 사용자 발화.
- `subjectId: string` — 생성 문항 분류(NOT NULL 요건).
- `currentQuestions?: {index, questionType, stem, choices?, answer?, explanation?}[]` — 좌측 캔버스 현재 상태(교체 대상 참조용, 평문 요약).

**히스토리**: Redis 키 `authoring:{workbookId}:{userId}`. tutor의 `loadHistory`/`trimTurns`/append 패턴 재사용. TTL·턴 수 상한 동일 정책.

**LLM**: `GeminiLlmService.streamChat` 재사용(산문 스트림). 출제 전용 시스템 프롬프트 신설(`authoring-chat.prompt.ts`):
- 평소엔 자연스러운 한국어 대화(되묻기·설계 제안).
- 문항을 낼 준비가 되면 프롬프트가 **펜스 블록** 하나를 산문 뒤에 붙이도록 지시:

````
```qidea-questions
[
  {
    "target": "new" | "replace:<index>",
    "questionType": "객관식" | "주관식",
    "stem": "평문",
    "choices": ["...", "..."],        // 객관식만
    "correctIndex": 0,                 // 객관식만
    "answerText": "평문",              // 주관식 단답만
    "explanation": "평문",
    "passage": "평문"                  // 선택
  }
]
```
````
- 배열이므로 한 문제 또는 여러 문제 동시 방출 가능.
- **평문만** 방출(ProseMirror 트리 금지) — CLAUDE.md의 "LLM은 평문만" 규칙 준수.

기존 `POST /ai-generations`(비동기 구조화 생성)는 그대로 두되 이 흐름에서는 쓰지 않는다.

### 프론트엔드

**스트림 소비** (`lib/api.ts` 에 `streamAuthoringChat` 추가):
- fetch로 SSE 수신, 델타 누적 → 말풍선 실시간 갱신(tutor 튜터챗 클라 패턴이 있으면 재사용).
- 누적 완료 후 ```qidea-questions 블록 파싱. 블록 앞 산문 = 말풍선 본문, 블록 = 제안 카드.

**제안 렌더**:
- 파싱된 각 문항을 채팅 안 미리보기 카드로 렌더(발문·선지·정답·해설 평문).
- 각 카드 "추가"(target=new) 또는 "교체"(target=replace:N) 버튼 + 여러 개면 "모두 추가".

**캔버스 반영**:
- 클릭 → `buildRichBlocks`/`buildRichDoc`로 평문을 ProseMirror JSON 조립 → 좌측 draft 상태 add 또는 replace[index].
- 미저장 draft는 로컬 id, 저장 시 `POST /questions` → 발행 → 문제집 연결(기존 `WorkbookBuilder`/`QuestionEditor` handleSave 로직 재사용).

**수동 편집**: 좌측 카드의 Tiptap 편집은 기존 그대로 유지.

## 데이터 흐름 (한 턴)

```
사용자 입력 → POST /ai-generations/chat (message + workbookId + subjectId + currentQuestions 요약)
  → 서버: Redis 히스토리 로드 + 컨텍스트 → Gemini streamChat → SSE 델타
  → 클라: 델타 누적(말풍선) → 완료 후 ```qidea-questions 파싱
  → 산문 말풍선 + 제안 카드(들) 렌더
사용자 "추가"/"교체" 클릭
  → buildRichBlocks로 조립 → 좌측 캔버스 카드 add/replace
저장 툴바
  → POST /questions + 발행 + 문제집 연결 (기존 로직)
서버: 이번 턴(user+assistant) Redis 히스토리에 append
```

## 에러 처리

- SSE 첫 바이트 전 실패(429/403/키없음) → tutor와 동일, HTTP 에러 + 토스트.
- 스트림 중간 실패 → tutor 정책대로 조용히 종료(부분 말풍선 유지), 재시도 안내.
- ```qidea-questions 파싱 실패(깨진 JSON) → 산문만 말풍선으로 표시하고 "문항을 다시 만들어달라고 요청하세요" 힌트. 크래시 금지(방어적 파싱).
- `target=replace:N` 이 존재하지 않는 인덱스 → 무시하고 new 로 폴백 + 경고 토스트.
- 저장 실패 → 문항별 실패 카운트 토스트(기존 `WorkbookBuilder` 패턴).

## 테스트

- 백엔드: `authoring-chat` 시스템 프롬프트 → 펜스 블록 파싱 유닛 테스트(단일/다중/교체/주관식/지문 포함). Redis 히스토리 append/trim. `regenerate-choices.spec.ts` 스타일 참고.
- 프론트: ```qidea-questions 추출 파서 유닛 테스트(정상/깨진 JSON/여러 블록/산문만). `buildRichBlocks` 조립 후 `extractPlainText` 왕복 검증.

## 재사용 자산

- `src/modules/tutor/*` — SSE 컨트롤러, Redis 히스토리, `trimTurns`, streamChat 소비.
- `GeminiLlmService.streamChat` (`gemini-llm.service.ts:139`).
- `web/lib/prosemirror.ts` — `buildRichDoc`/`buildRichBlocks`/`extractPlainText`.
- `QuestionEditor` 카드 UI + `handleSave` 영속화 로직.
- `WorkbookBuilder` 과목 선택 + 발행→문제집 연결 로직.
