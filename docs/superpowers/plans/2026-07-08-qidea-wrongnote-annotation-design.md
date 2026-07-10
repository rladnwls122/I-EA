# 오답노트 2.0 — 텍스트 주석 + 통합 통계 설계

- 작성일: 2026-07-08
- 목적: 기존 "문제당 단일 메모(content+canvas)"를 **텍스트 범위 앵커 주석(하이라이트/밑줄 + 태그 + 플로팅 메모)**으로 고도화하고, **통계와 메모를 한 엔드포인트로 병합**한다.
- 뿌리: 원본 DDL `exam_studio_db_schema.md` §3.16(드래그 핀포인트 오답노트)의 실현 버전.

---

## 1. 개념

- **주석(annotation) = 하이라이트 1개 = 1행.** 한 문제에 여러 개 가능(기존 UNIQUE(user,question) 폐기).
- 각 주석은 **텍스트 범위에 앵커**된다: 어느 구역(target)의 어느 오프셋(selectionRange)인지 + 원본 문구(selectedText).
- 주석에는 **시각 표기**(하이라이트/밑줄 + 색), **오답원인 태그**(reasonCode), **메모**(memoText)가 붙는다.
- `selectedText`/`selectionRange`가 없으면 **문항 전체 대상 일반 메모**(앵커 없는 노트)로도 쓸 수 있다.
- 펜 필기(캔버스)는 오답노트에서 분리 → 응시 중 `exam_session_answers.annotations`에만 남는다(성격이 다름).

## 2. 데이터 모델 (`user_question_annotations`)

Prisma 모델 `UserQuestionAnnotation` (schema.prisma §15). 주요 필드:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | CHAR(36) | PK |
| `userId` / `questionId` | CHAR(36) | 소유자 / 대상 문항 |
| `target` | VARCHAR(20) | `GENERAL`\|`PASSAGE`\|`STEM`\|`CHOICES`\|`EXPLANATION` (기본 STEM) |
| `targetId` | VARCHAR(36)? | 지문/선지 앵커 ID(예: choice id). 없으면 null |
| `markStyle` | VARCHAR(20) | `HIGHLIGHT`\|`UNDERLINE` (기본 HIGHLIGHT) |
| `color` | VARCHAR(20) | 형광펜 색(기본 yellow) |
| `selectedText` | TEXT? | 하이라이트 원본 문구(재앵커 검증용). 일반 메모는 null |
| `selectionRange` | JSON? | `{ startOffset, endOffset }` — target 구역 평문 기준 오프셋 |
| `reasonCode` | VARCHAR(20)? | 오답원인 태그: `CONCEPT`\|`MISTAKE`\|`TIME`\|`OTHER` (통계 구동) |
| `memoText` | TEXT? | 플로팅 메모 내용 |
| `createdAt`/`updatedAt` | DATETIME | |

인덱스: `(userId, questionId)` 렌더용, `(userId, updatedAt)` 목록용, `(userId, reasonCode)` 통계용.

### selectionRange 앵커 규칙
- 저장: 선택 구역(target)의 **평문(extractPlainText)** 기준 `{ startOffset, endOffset }`.
- 렌더: 해당 구역 평문을 다시 만들어 `[startOffset, endOffset)`을 감싼다.
- 재앵커 폴백: 문항이 수정돼 오프셋이 어긋나면 `selectedText`를 평문에서 재검색해 위치 복원(첫 매치). 실패 시 주석은 "위치 불명"으로 목록에만 노출.
- 근거: 콘텐츠가 ProseMirror JSON이라 PM 절대위치는 편집에 취약 → 평문 오프셋 + 문구 폴백이 MVP에 견고.

## 3. API — 주석 CRUD (memos 모듈 → annotations 모듈로 개편)

| 메서드/경로 | 설명 |
| --- | --- |
| `GET /questions/:questionId/annotations` | 해당 문항의 **내** 주석 목록(렌더 시 하이라이트 재적용용) |
| `POST /questions/:questionId/annotations` | 주석 생성 |
| `PATCH /annotations/:id` | 주석 수정(memoText/reasonCode/color/markStyle/범위) — 본인만 |
| `DELETE /annotations/:id` | 주석 삭제 — 본인만 |

**제거되는 옛 엔드포인트:** `GET /me/memos`, `GET/PUT/DELETE /questions/:id/memo`.

**CreateAnnotationDto:** `target`, `targetId?`, `markStyle?`, `color?`, `selectedText?`, `selectionRange?`, `reasonCode?`, `memoText?`
**UpdateAnnotationDto:** 위 필드의 부분 갱신.
- 검증: `target ∈ {GENERAL,PASSAGE,STEM,CHOICES,EXPLANATION}`, `markStyle ∈ {HIGHLIGHT,UNDERLINE}`, `reasonCode ∈ {CONCEPT,MISTAKE,TIME,OTHER}`(nullable). `selectedText` 있으면 `selectionRange` 필수(쌍으로).

## 4. API — 통합 오답노트 (`GET /me/notes`)

기존 `GET /me/wrong-notes` + `GET /me/memos`를 **하나로 병합**. `GET /me/exam-sessions`(풀이기록)는 유지(별 목적).

```jsonc
{
  "summary": {
    "sessions": 4,            // 제출 세션 수
    "solved": 37,             // 자동채점된(is_correct NOT NULL) 답안 수
    "correct": 25,
    "scorePercent": 67.6,
    "bySubject": [ { "key": "<subjectId>", "label": "문학", "total": 12, "wrong": 5, "wrongRatio": 0.42 } ],
    "byType":    [ { "key": "객관식", "label": "객관식", "total": 30, "wrong": 8, "wrongRatio": 0.27 } ],
    "byReason":  [ { "code": "CONCEPT", "label": "개념부족", "count": 6 } ]  // 내 주석 reason_code 분포
  },
  "wrongQuestions": [
    {
      "questionId": "...", "subjectId": "...", "subjectName": "문학",
      "questionType": "객관식", "sessionId": "...",
      "annotationCount": 2,
      "annotations": [
        { "id": "...", "target": "STEM", "markStyle": "HIGHLIGHT", "color": "yellow",
          "selectedText": "...", "selectionRange": { "startOffset": 12, "endOffset": 28 },
          "reasonCode": "CONCEPT", "memoText": "이 조건을 놓침", "updatedAt": "..." }
      ]
    }
  ]
}
```

**집계 규칙(서비스, 인메모리 reduce):**
- `bySubject`/`byType`: SUBMITTED 세션의 자동채점 답안을 `question.subjectId` / `questionType`로 그룹핑, `wrong = isCorrect === false` 카운트, `wrongRatio = wrong/total`.
- `byReason`: 내 전체 주석을 `reasonCode`로 그룹핑한 분포(오답 원인 인사이트). null 코드는 제외.
- `wrongQuestions`: `isCorrect === false` 문항 + 각 문항에 대한 **내 주석 배열**을 조인해 중첩. (주석 없는 오답도 포함, `annotations: []`.)
- 서술형은 자기채점(`self-grade`)으로 `isCorrect`가 확정된 뒤에만 통계에 반영(그 전엔 `isCorrect = null` → solved/집계 제외).

## 5. 프론트엔드 상호작용 스펙 (핵심)

### 5.1 렌더(하이라이트 재적용)
- 문항 상세/결과 화면에서 `GET /questions/:id/annotations` 로드.
- `QuestionViewer`가 각 target 구역을 렌더할 때, 그 구역 평문에서 각 주석의 `[startOffset,endOffset)`을 찾아 `HIGHLIGHT`는 `<mark style=bg:color>`, `UNDERLINE`은 밑줄 `<span>`으로 감싼다. 겹치는 범위는 뒤에 온 주석이 위에 쌓이도록 분할 렌더.

### 5.2 선택 → 주석 생성
- 사용자가 텍스트를 드래그하면 `window.getSelection()`으로 범위 확보 → 선택 끝점 근처에 **생성 팝오버**(색상 스와치 · 하이라이트/밑줄 토글 · 태그 칩[개념/실수/시간/기타] · 메모 입력).
- 저장 시 선택 범위를 target 구역 평문 오프셋으로 환산 → `POST /questions/:id/annotations`.

### 5.3 호버 → 플로팅 메모
- 하이라이트에 마우스 진입 시 **HoverCard**(transient)로 `memoText` + 태그 칩을 띄운다. 위치는 하이라이트 rect 기준(포퍼).
- 마우스가 벗어나면 닫힘(기본 호버 동작).

### 5.4 확장 → 포커스 고정(핀) + 포커스 트랩  ← 사용자가 강조한 부분
- 플로팅 메모의 **"확장" 버튼** 클릭 시, transient HoverCard를 **controlled·modal Popover로 승격**한다:
  - `open` 상태를 코드가 소유(호버 종료로 닫히지 않음) → **마우스가 하이라이트/화면 밖으로 벗어나도 유지**.
  - 승격 즉시 메모 `<textarea>`에 **포커스 이동**(`autoFocus` 또는 `ref.current.focus()`).
  - **포커스 트랩** 적용(Radix `Popover` `modal` 또는 `FocusScope trapped`) → 이후 키 입력/탭 이동이 팝오버 내부에 갇힘. 즉 포인터가 어디에 있든 타이핑은 메모로 간다.
  - 닫기: 바깥 클릭 또는 ESC(`onInteractOutside`/`onEscapeKeyDown`)에서만. 닫을 때 변경분 `PATCH /annotations/:id`.
- 구현 노트: `@radix-ui/react-hover-card`(호버) + `@radix-ui/react-popover`(modal, 확장) 조합. 확장 시 HoverCard를 언마운트하고 같은 anchor에 modal Popover를 열어 FocusScope가 트랩을 담당. (Radix Popover의 `modal` prop이 포커스 트랩 + 스크롤 잠금을 제공.)

### 5.5 오답노트 페이지(`/me/notes`)
- `GET /me/notes` 한 번으로 요약 그래프(bySubject/byType/byReason 막대) + 오답 문항 리스트(각 문항의 내 주석 미리보기) 구성.
- 문항 클릭 → `/questions/[id]`에서 하이라이트가 재적용된 상태로 열림(§5.1).

## 6. 서비스 리팩터링 영향(기존 계획에 추가)

- `memos` 모듈 → `annotations` 모듈로 개편: 서비스/컨트롤러/DTO 재작성, 단일 upsert → 다행 CRUD.
- `me` 모듈: `wrongNotes`를 `notes`로 확장 — subjectId 집계 + byReason(주석) + wrongQuestions에 주석 조인. `bySubject`/`byType`로 키 변경(이전 `byUnit` 폐기).
- `app.module`: 모듈명 교체 등록.
- 프론트: `MemoPanel` → `AnnotationLayer`(렌더 오버레이) + `AnnotationPopover`(생성/호버/확장) + `WrongNoteDashboard`.

## 7. 열린 결정

- **태그 다중 선택 여부**: 현재 `reasonCode` 단일(통계 단순·명확). 다중 태그가 필요하면 `tags Json`로 확장(집계는 인메모리라 수용 가능).
- **byReason 모수**: 현재 "내 전체 주석" 기준. "오답 문항의 주석"만으로 좁힐지 여부.
- **주석 공개 범위**: MVP는 전부 비공개(본인 전용). 공유 오답노트는 범위 밖.
