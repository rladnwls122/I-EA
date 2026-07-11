# 세션 페이지 설계 (`/exam-sessions/[id]`) — 풀기 + 결과 듀얼모드

날짜: 2026-07-11
상태: 승인됨 (구현 대기)
관련: 문항 상세(`2026-07-11-question-detail-page-design.md`), 홈 대시보드(`2026-07-11-home-dashboard-design.md`)

## 배경 / 위치

서브프로젝트 지도의 **B(세션 풀이 화면) + C(세션 결과 페이지)를 하나로 병합**한다. 근거: `GET /exam-sessions/:id`가 세션 상태로 응답을 이미 분기한다 — `IN_PROGRESS`면 정답 마스킹(풀기), `SUBMITTED`면 정답·채점 공개(결과). 즉 **같은 라우트가 status로 풀기↔결과 모드를 바꾼다**. 제출 시 상태가 뒤집히며 그 자리에서 결과로 전환된다.

진입: 문제집 "바로 풀기"(`startWorkbook`→`{examSessionId}`) 또는 필터 조립(`POST /exam-sessions`)으로 세션 생성 후 이 라우트로 이동(진입점은 별도 SP-E). 결과 모드의 문항 카드는 문항 상세(`/questions/[id]?reveal=1`)로 링크.

**백엔드 변경 없음** — 응시/제출/자기채점/힌트 엔드포인트 전부 존재. 프론트 연동만 신규.

## 목표

- 한 라우트 `/exam-sessions/[id]`에서 풀기·결과 두 모드 제공(status 분기)
- 문항 2열 그리드 + 우측상단 접이식 OMR + autosave
- 하단바 편의기능: 타이머 · 진행 · 저장표시 · 화면필기 ON/OFF · 계산기 · 제출
- 결과 모드: 채점 요약 배너 + 문항별 채점색/해설 + 서술형 자기채점

## 비목표 (YAGNI)

- 세션 생성 진입 UI(문제집 바로풀기 버튼/필터 조립) — 별도 SP-E
- 화면필기·계산기 상태 **영속화** — 전부 클라이언트 휘발(DB/백엔드 무관)
- 실시간 타이머 서버 동기화 — durationSec는 제출 시 서버가 `startedAt` 기준 재계산. 클라 타이머는 표시용.

## 데이터 소스 (전부 기존 API)

| 동작 | 엔드포인트 | 비고 |
|---|---|---|
| 세션 조회(모드 분기) | `GET /exam-sessions/:id` | IN_PROGRESS=마스킹, SUBMITTED=공개. questions[].snapshot/answer 포함 |
| 답안 저장(OMR) | `PUT /exam-sessions/questions/:sqId/answer` | upsert, 즉시 채점하되 진행중엔 `{saved:true}`만 반환 → autosave 적합 |
| 힌트 열람 | `POST /exam-sessions/questions/:sqId/hint` | 힌트 있는 문항만. `is_hint_used` 기록 |
| 최종 제출 | `POST /exam-sessions/:id/submit` | `{total,answered,correct,scorePercent,durationSec,reward}` |
| 서술형 자기채점 | `PUT /exam-sessions/questions/:sqId/self-grade` | SUBMITTED에서만. `{isCorrect}` |

## 레이아웃 — 풀기 모드 (IN_PROGRESS)

```
┌────────────────────────────────────┬──────────────┐
│ 문항 2열 그리드 (스크롤)            │ OMR 패널      │
│  ┌──────────┐ ┌──────────┐         │ (우측상단     │
│  │ 1. stem  │ │ 2. stem  │         │  sticky,      │
│  │ 선지 OMR │ │ 선지 OMR │         │  > 로 접기)   │
│  │ [힌트]   │ │ [힌트]   │         │ 번호 그리드   │
│  └──────────┘ └──────────┘         │ 답한칸 채움   │
│  ...                               │ 클릭→점프     │
├────────────────────────────────────┴──────────────┤
│ 하단바(sticky): ⏱경과 · 답안 N/M · 💾저장됨         │
│   · [✏️화면필기] · [🧮계산기] · [제출]              │
└────────────────────────────────────────────────────┘
```

- **OMR 패널**: 우측상단 sticky. `>` 버튼으로 접기/펼치기(`useState` + 슬라이드 트랜지션). 접으면 얇은 탭만 남김. 번호 그리드에서 답한 문항 채움/안 푼 문항 강조, 클릭 시 해당 카드로 스크롤(`scrollIntoView`).
- **문항 카드**: stem(+이미지) + 선지 OMR(객관식 라디오/복수정답이면 체크, 주관식 입력). 힌트 있는 문항은 힌트 버튼.
- **autosave**: 객관식 선택 즉시 `PUT answer`. 주관식 텍스트 debounce(600ms) 후 `PUT`. 저장 성공 시 하단바 "저장됨" + 카드 미세 표식. 실패 시 재시도/경고.

## 레이아웃 — 결과 모드 (SUBMITTED)

- 상단 **결과 배너**: `scorePercent`, `correct/total`, `durationSec`, 획득 XP(`reward`). (제출 응답 or 재조회 값)
- 문항 2열 그리드: 카드마다 채점색(정답 초록 `--primary`/오답 빨강) + 내 답 + 정답 + 해설. 서술형(정답텍스트 없음)은 **자기채점 토글**(맞음/틀림 → `PUT self-grade`, 갱신 후 배너/카드 반영).
- 각 카드 하단 "문항 상세 보기" → `/questions/[id]?reveal=1`.
- OMR 패널은 결과 모드에선 정오 색으로 채운 요약(선택). 하단바는 [화면필기]/[계산기]만(제출 없음).

## 편의 기능 (클라이언트 전용, 휘발)

### 화면필기 모드
- 전체화면 `<canvas>` 오버레이(`fixed inset-0 z-[60]`). ON이면 포인터 캡처해 자유 드로잉(마우스+터치 pointer events). OFF면 `pointer-events:none`으로 하위 UI 통과.
- 도구: 색 몇 개 + 지우개 + 전체 지우기. 저장 안 함(모드 끄면/이탈 시 소멸).
- 하단바 [화면필기] 토글로 ON/OFF.

### 계산기 (공학용)
- **`mathjs` 라이브러리 추가**(`web`에 `npm i mathjs`, 현재 미설치). 수식 평가는 `math.evaluate(expr)`.
- 공학용 버튼 그리드(sin/cos/tan/log/ln/√/^/π/e/괄호/소수) + 디스플레이. 입력 문자열을 mathjs로 평가.
- 플로팅·드래그 가능한 창(`fixed`, 헤더 드래그로 이동). 하단바 [계산기] 토글로 열기/닫기.
- 안전: 사용자 입력을 `math.evaluate`에만 넘김(문자열 파서, 임의 JS 실행 아님).

## 프론트 컴포넌트 구조

라우트: `web/app/exam-sessions/[id]/page.tsx` → `<SessionPage id={params.id} />`

`web/components/exam-session/`:
- `SessionPage.tsx` — 세션 조회 + status로 풀기/결과 분기. 타이머·OMR접힘·필기·계산기 상태 소유.
- `OmrPanel.tsx` — 접이식 답안지(번호 그리드, 점프).
- `SolveQuestionCard.tsx` — 풀기 카드(선지 OMR + autosave + 힌트).
- `ResultQuestionCard.tsx` — 결과 카드(채점색/정답/해설/자기채점 + 상세 링크).
- `ResultBanner.tsx` — 채점 요약.
- `SolveBottomBar.tsx` — 타이머/진행/저장/필기/계산기/제출.
- `SubmitDialog.tsx` — 안 푼 문항 N개 경고 + 확인.
- `DrawingOverlay.tsx` — 화면필기 canvas.
- `Calculator.tsx` — mathjs 공학용 플로팅 계산기.

## 훅/API — 전부 신규 (프론트에 세션 응시 연동 전무)

`lib/api.ts` / `lib/hooks.ts` 추가:
- `fetchSession(id)` / `useSession(id)` — `GET /exam-sessions/:id`
- `submitAnswer(sqId, dto)` / `useSubmitAnswer()` — `PUT .../answer` (autosave)
- `revealHint(sqId)` / `useRevealHint()` — `POST .../hint`
- `submitSession(id)` / `useSubmitSession()` — `POST /:id/submit`
- `selfGrade(sqId, isCorrect)` / `useSelfGrade()` — `PUT .../self-grade`
- 타입(`lib/types.ts`): `SessionDetail`, `SessionQuestion`(snapshot+answer), `SubmitResult`, `SubmitAnswerInput`

기존 `startWorkbook`(api.ts:288)은 SP-E에서 재사용.

## ProseMirror / 방어

- snapshot.stem·choices[].content·explanation은 ProseMirror JSON → `extractPlainText`/전용 렌더러. raw 금지.
- `localStorage` 토큰 가드, `(data||[]).map`, `new Date()` 전 존재 체크.
- autosave 레이스: 같은 문항 연속 변경 시 마지막 요청이 이기도록(요청 최신값 기준, react-query 뮤테이션 키에 sqId 포함).

## 리스크 / 주의

- **mathjs 의존성**: 번들 증가. `Calculator`를 `next/dynamic`(`ssr:false`)로 지연 로드해 초기 번들에서 분리.
- **canvas 오버레이 pointer-events**: OFF일 때 반드시 통과(`pointer-events:none`), ON일 때만 캡처. z-index가 하단바/계산기보다 적절히.
- **제출 후 상태**: 제출 성공 시 `useSession` 무효화(invalidate)로 SUBMITTED 재조회 → 결과 모드 렌더. 제출 응답의 요약도 배너에 즉시 사용.
- **타이머**: 클라 표시용. 진짜 durationSec는 서버가 계산 → 결과 배너는 서버값 사용.
- **라우트 신규**: `/exam-sessions/[id]` 현재 없음. 홈/오답노트/결과의 세션 링크가 이 라우트로 수렴.

## 테스트 관점

- 타입체크(`tsc --noEmit`). mathjs 설치 후 빌드 확인.
- Railway API로 세션 생성(문제집 start) → 풀기(autosave 저장됨 확인) → 제출 → 결과 모드 전환·점수 육안 확인.
- 화면필기 ON/OFF 시 하위 클릭 통과 여부, 계산기 평가(`sin(pi/2)`=1 등) 확인.

## 후속

- SP-E: 세션 생성 진입(문제집 "바로 풀기" 버튼, 필터 조립 UI)
- SP-D: 홈 대시보드 이어하기 배너 → 이 라우트(IN_PROGRESS)로 링크
