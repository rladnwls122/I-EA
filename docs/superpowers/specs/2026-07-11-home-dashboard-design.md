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

- 실제 검색어 로깅/인기검색어 (백엔드 없음 → 조회수 기준 인기 콘텐츠로 대체)
- 구글/소셜 로그인 (백엔드에 OAuth 없음)
- IN_PROGRESS 세션 이어풀기 화면 자체 (배너에서 기존 세션 상세로 링크만; 풀이 화면은 범위 밖)

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

## 테스트 관점

- 백엔드: `me.service.spec.ts`에 `activeSession` 케이스 추가(IN_PROGRESS 있음/없음, 다른 유저 격리).
- 프론트: 타입체크(`tsc --noEmit`) + 실제 Railway API로 로그인 후 `/` 렌더 확인.
