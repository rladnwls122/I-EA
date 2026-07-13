# 홈 대시보드 설계

날짜: 2026-07-11
상태: 승인됨 (구현 대기)

## 배경

`web/app/page.tsx`는 현재 마케팅 히어로(정적 문구 + 기능 소개 3카드)다. 비로그인 첫 방문은 이미 `/intro`로 리다이렉트되므로 홈의 마케팅 역할은 중복이다. 또한 백엔드에 이미 있는 게이미피케이션 데이터(xp/level/streak/milestone)와 오답노트 통계가 프론트에서 전혀 노출되지 않는다.

홈을 **개인 학습 대시보드**로 전면 교체한다. `/intro`가 마케팅을, 홈이 로그인 후 대시보드를 담당한다.

## 목표

- 로그인 사용자에게 개인 기록(스트릭/XP/레벨, 오답노트 요약, 최근 풀이 기록, 마일스톤)을 한 화면에 제공
- 이미 존재하지만 미사용인 백엔드 데이터(`/me/milestones`, `/me/notes`, `/me/exam-sessions`)를 활용
- 인기 문제/문제집(조회수 기준)으로 탐색 유도
- 풀다 만 세션(IN_PROGRESS)이 있으면 이어하기 유도
- 비로그인 상태에서도 인기 콘텐츠는 둘러볼 수 있게 하되 개인화 섹션은 블러 게이트로 로그인 유도

## 비목표 (YAGNI)

- 실제 **검색어 로깅**/인기검색어 순위 (백엔드 없음 → 조회수 기준 인기 콘텐츠로 대체). 스포트라이트 검색 자체는 포함(기존 `useQuestions({search})` 사용).
- 구글/소셜 로그인 (백엔드에 OAuth 없음)
- 상세페이지 4종 신규 구현 — `/workbook/[id]`, `/workbook/[id]/edit`, `/exam-sessions/[id]`, `/questions/[id]`. 모두 **deferred**(F절 참고). 카드는 없는 라우트로 링크 걸지 않음.
- IN_PROGRESS 세션 이어풀기 **풀이 화면**. 이어하기 배너는 넣되, 대상 풀이 화면이 없으므로 배너 클릭 라우팅도 deferred(배너는 표시·요약까지).

## 레이아웃 (2단: 본문 + 사이드바)

```
┌─────────────────────────────────────────────┐
│ 인사말 + 헤어로: 🔥연속 N일 · Lv.X · XP 진행바 │  전체너비
├─────────────────────────────────────────────┤
│ [이어하기 배너] ← IN_PROGRESS 있을 때만       │  전체너비, 조건부
├──────────────────────────┬──────────────────┤
│ 본문 (2fr)               │ 사이드바 (1fr)   │
│ · 오답노트 요약          │ · 마일스톤 진행률 │
│   (도넛 + 원인별 바)     │ · 인기 문제 top5 │
│ · 최근 풀이 기록 (5개)   │ · 인기 문제집 top5│
└──────────────────────────┴──────────────────┘
```

모바일: 사이드바가 본문 아래로 세로 스택(`lg:grid-cols-3`, 기본 1단).

## 데이터 소스

| 섹션 | API | 비고 |
|---|---|---|
| 헤어로 (스트릭/XP/레벨) | `GET /me/milestones` → `summary` | 기존, 미사용이었음 |
| 마일스톤 진행률 | `GET /me/milestones` → `milestones[]` | 기존, 미사용이었음 |
| 오답노트 요약 | `GET /me/notes` → `summary` | 기존 (`ReasonDonut` 재사용) |
| 최근 풀이 기록 | `GET /me/exam-sessions` | 기존, SUBMITTED만 반환 |
| 인기 문제 | `GET /questions?sort=popular&limit=5` | 기존 |
| 인기 문제집 | `GET /workbooks?sort=popular&limit=5` | 기존 |
| 이어하기 배너 | `GET /me/exam-sessions/active` | **신규 (백엔드 추가)** |

## 백엔드 변경 (최소)

`me` 모듈에 이어하기용 엔드포인트 1개 추가.

- **엔드포인트**: `GET /me/exam-sessions/active`
- **동작**: 요청자의 가장 최근 `IN_PROGRESS` 세션 1개를 반환. 없으면 `null`.
- **응답 형태**:
  ```ts
  {
    id: string;
    subjectName: string | null;
    workbookTitle: string | null;
    total: number;        // 세션 문항 수
    answered: number;     // 답안이 있는 문항 수 (진행률)
    startedAt: string | null;
  } | null
  ```
- **구현**: `me.service.ts`에 `activeSession(userId)` 추가, `me.controller.ts`에 `@Get('exam-sessions/active')` 라우트 추가. 파라미터 없음 → DTO 불필요.
- **주의**: 라우트 등록 순서상 `@Get('exam-sessions')`와 `@Get('exam-sessions/active')`가 충돌하지 않도록 정적 세그먼트(`active`)가 먼저/명확히 매칭되게 둔다(NestJS는 정적 경로 우선이나, 컨트롤러 내 선언으로 명확히).

## 프론트 컴포넌트 구조

새 파일 (`web/components/dashboard/`):

- `Dashboard.tsx` — 최상위. 로그인 게이트 + 레이아웃 그리드. `page.tsx`는 `<Dashboard/>`만 렌더(login/signup 패턴 동일).
- `StreakHero.tsx` — 인사말 + 스트릭/레벨/XP 진행바 (`/me/milestones` summary)
- `ResumeBanner.tsx` — 이어하기 배너 (active 세션 있을 때만, 없으면 렌더 안 함)
- `WrongNotesSummary.tsx` — 오답노트 요약 (도넛 + 원인별 바, `/me/notes` summary)
- `RecentSessions.tsx` — 최근 풀이 기록 리스트 (최대 5개)
- `MilestoneProgress.tsx` — 마일스톤 진행률 (`/me/milestones` milestones[])
- `PopularContent.tsx` — 인기 문제 top5 + 인기 문제집 top5

### 재사용 리팩터

`NotesDashboard.tsx`의 `ReasonDonut`·`reasonColor`·`REASON_COLORS`·`FALLBACK_COLORS`를 `components/notes/ReasonDonut.tsx`로 추출. `NotesDashboard`와 `WrongNotesSummary`가 공유. `NotesDashboard`는 추출본을 import(동작 변화 없음).

### 훅/API 추가 (`lib/hooks.ts`, `lib/api.ts`)

- **신규**: `fetchMilestones()` / `useMilestones()` — `GET /me/milestones`
- **신규**: `fetchActiveSession()` / `useActiveSession()` — `GET /me/exam-sessions/active`
- **기존 재사용**: `useMyExamSessions`(hooks.ts:362), `useMyNotes`(hooks.ts:350), `fetchMyExamSessions`(api.ts:454)
- **기존 확인 필요**: `useQuestions`/`useWorkbooks`에 `sort:'popular'` 파라미터가 이미 전달되는지 — 안 되면 파라미터만 추가
- 타입: `lib/types.ts`에 `MilestoneSummary`, `Milestone`, `ActiveSession` 추가

## 비로그인 처리 (블러 게이트)

`Dashboard.tsx`가 `typeof window !== 'undefined' && localStorage.getItem('token')`으로 판정:

- **토큰 있음** → 정상 대시보드
- **토큰 없음** →
  - 개인화 섹션(헤어로·이어하기·오답노트·최근기록·마일스톤): 컨테이너에 `blur-sm pointer-events-none select-none`, 그 위에 절대배치 오버레이("로그인하고 내 기록 보기" + `/login` 버튼)
  - 인기 문제/문제집: 블러 없이 정상 노출 (둘러보기 허용)
  - 개인화 API 호출은 토큰 없으면 스킵(`enabled: !!token`)해서 401 방지

방어 가드(CLAUDE.md 관례): `localStorage` 접근 전 `typeof window` 체크, `(data || [])` 가드, `new Date()` 전 존재 확인.

## 리스크 / 주의

- **라우트 충돌**: `/me/exam-sessions/active` vs `/me/exam-sessions` — 컨트롤러 선언으로 정적 경로 우선 보장.
- **ProseMirror 렌더**: 오답 문항/문제 stem은 JSON이므로 반드시 `extractPlainText` 경유(raw 렌더 금지).
- **Vega 미사용**: 도넛은 기존 SVG 구현(`ReasonDonut`)이라 Vega SSR 이슈 없음.
- **하이드레이션**: 로그인 게이트가 `localStorage` 기반이라 서버/클라 초기 렌더 불일치 가능 → 마운트 후 판정(`useState` + `useEffect`)으로 처리, 초기엔 스켈레톤.

## 인터랙션 명세 (추가 요구사항)

### A. 상단 글로벌 내비게이션 숏컷

대시보드 최상단(헤어로 위 또는 nav 바)에 숏컷 배치:
- `[문제집 둘러보기]` — 라우트 이동 아님. 같은 페이지의 인기 콘텐츠 섹션으로 스크롤(anchor `#popular`, `scrollIntoView({behavior:'smooth'})`).
- `[나만의 문제집 생성]` — `/workbook/create`로 이동(**기존 라우트, 단수**). 프롬프트의 `/workbooks/new`는 오타 — 실제 컨벤션은 단수 `/workbook/*`.

### B. 스포트라이트 검색 게이트

대시보드 상단 검색바 포커스/클릭 시:
- 배경: `fixed inset-0 bg-black/40 backdrop-blur-sm z-40`로 주변 UI 차단.
- 검색/필터 패널: 화면 중앙 레이어(`z-50`)로 띄워 시선 집중.
- ESC 또는 배경 클릭 시 닫힘. 열릴 때 검색 input 자동 포커스.
- 상태는 로컬(`useState`), 전역 스토어 불필요.

### C. 다단계 카테고리 필터 (스포트라이트 내부)

`GET /subjects`(3단 분류 리프 배열)를 클라에서 `examType → examCategory → name`으로 그룹핑해 구동:
- **Step 1**: 시험 유형(examType) 버튼 그룹 최상단. 선택 시 하단에 관련 대분류 노출.
- **Step 2**: 선택한 시험의 대분류(examCategory) 버튼 그룹.
- **Step 3**: 대분류 클릭 시 — 선택 안 된 대분류는 페이드아웃(`opacity-0 transition-opacity duration-300` 후 언마운트), 선택된 대분류는 `flex-start`(맨 왼쪽)로 이동, 우측에 소분류(name) 항목 동적 렌더.
- **필터 취소**: 소분류 리스트 마지막에 빨강 배경/텍스트 `[카테고리 취소]` 버튼 상시 배치 → 필터 전체 초기화(Step 1로 복귀).
- 선택 결과(subjectId)로 `useQuestions({ subjectId, search })` 호출, 결과를 문제 카드로 렌더.

### D. 문제 카드 (Question Card)

- 필터/검색 결과 리스트를 카드로 렌더. 기존 `components/questions/QuestionCard`가 있으면 재사용, 미리보기 정책만 조정.
- **미리보기 정책**: stem을 생략 없이 **전체 노출**(ellipsis/line-clamp 미적용). 단 `lib/prosemirror.ts`의 `extractPlainText`를 반드시 통과(ProseMirror JSON → 평문). raw 렌더 금지.
- **클릭**: 상세 라우트(`/questions/[id]`)가 **없으므로** 기존 `QuestionPreview` 슬라이드오버를 연다(`/questions` 페이지 패턴 동일). 라우팅 아님 → 404 없음.

### E. 호버 마이크로 인터랙션 (전역 정책)

- **필터/일반 버튼**: `transition-all duration-300` + 호버 시 테두리 하이라이트 + 배경/텍스트 반전.
- **문제 카드 / 콘텐츠 카드**: 호버 시 `-translate-y-1` + `shadow-lg` + `hover:border-primary/40`. `motion-reduce:` 가드로 접근성 대응(기존 홈 카드 패턴 따름).

### F. 카드 라우팅 (있는 곳만 — 나머지 defer)

| 카드 | 대상 | 이번 범위 |
|---|---|---|
| 문제 카드 | `QuestionPreview` 슬라이드오버 | ✅ 동작 (라우트 아님) |
| 나만의 문제집 생성 | `/workbook/create` | ✅ 기존 라우트 |
| 문제집 둘러보기 | `#popular` 스크롤 | ✅ anchor |
| 최근 풀이 기록 카드 | `/exam-sessions/[id]` | ⏸ **페이지 없음 → 링크 안 검**. 카드는 비클릭(요약만). 상세는 별도 작업. |
| 인기/내 문제집 카드 | `/workbook/[id]` | ⏸ **페이지 없음 → 링크 안 검**. 카드는 비클릭. |
| 문제집 수정 | `/workbook/[id]/edit` | ⏸ **페이지 없음 → 수정 버튼 이번엔 미배치**. |

**중요**: 없는 상세페이지로 링크 걸면 아까 고친 것과 같은 404. 그래서 존재하는 라우트/슬라이드오버/anchor로만 연결하고, 상세페이지 4종(`/workbook/[id]`, `/workbook/[id]/edit`, `/exam-sessions/[id]`, `/questions/[id]`)은 **명시적으로 이번 범위 밖(deferred)**으로 남긴다. 후속 스펙에서 다룸.

## 테스트 관점

- 백엔드: `me.service.spec.ts`에 `activeSession` 케이스 추가(IN_PROGRESS 있음/없음, 다른 유저 격리).
- 프론트: 타입체크(`tsc --noEmit`) + 실제 Railway API로 로그인 후 `/` 렌더 확인. 스포트라이트 게이트 열림/닫힘·필터 단계 전환·문제 카드 전체 stem 노출 육안 확인.
