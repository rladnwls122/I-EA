# 풀이화면 2열 문제지 배치 (Exam-Sheet Layout)

**작성일**: 2026-07-12
**상태**: 초안 — 사용자 리뷰 대기
**참고**: 사용자 제공 스크린샷(기출 문제지 스타일 2열 뷰). 사용자가 "배치 참고용"이라 명시 — 기능 복제가 아니라 **중앙에 모인 2열 문제지 느낌**이 목표.

## 배경

`SessionPage`(exam-sessions/[id]) 풀이·결과 모드는 이미 `grid md:grid-cols-2` 2열이다. 다만:

- 풀이 모드는 `p-6` 풀폭이라 와이드 화면에서 문제가 좌우로 흩어져 "문제지" 느낌이 없다(결과 모드만 `max-w-5xl` 중앙 정렬).
- 참고 이미지의 시험지 감성 요소(중앙 세로 구분선, 문항별 정답률)가 없다.

## 범위

**포함**
1. **풀이 모드 중앙 정렬** — 그리드 컨테이너에 `mx-auto max-w-5xl` (결과 모드와 통일). OMR 패널은 우측 고정 유지.
2. **시험지 세로 구분선** — 2열 사이 중앙에 hairline(`divide-x` 또는 gap 중앙 border). `md:` 이상에서만. 풀이·결과 모드 공통.
3. **문항별 정답률 배지** — 카드 우하단 `(정답률: NN%)` 스타일. **백엔드 확장 필요**: 세션 조립 시 `QuestionSnapshot`에 `totalSolvedCount`/`correctSolvedCount`를 복사(스냅샷 원칙 유지 — 조립 시점 값 고정). 프론트 `SessionQuestionSnapshot` 타입에 optional 필드 추가, 값 있고 `totalSolvedCount >= 10`일 때만 표시(표본 적으면 노이즈).

**제외**
- 이미지의 정답/공유/체크/작성/해설 버튼 행 — 기존 UX(풀이 중 마스킹, 제출 후 ResultQuestionCard의 해설/자기채점)와 충돌. 열람용 별도 모드는 별개 논의.
- 모바일 반응형 — 별도 트랙(기존 결정).
- 폰트/명조체 등 기출 문제지 시각 복제.

## 구현 스케치

- `web/components/exam-session/SessionPage.tsx`
  - 풀이 모드: `<div className="flex-1 grid ...">` → 부모에 `mx-auto max-w-5xl w-full`, 그리드에 `md:divide-x md:divide-border` 대신 열 사이 구분은 `gap-0 md:[&>*]:px-5` + 중앙 border 트릭 또는 간단히 `md:gap-8` + 컨테이너 `relative` + 중앙 absolute hairline. 가장 단순한 안: 그리드를 `md:gap-x-10`으로 벌리고 컨테이너에 `md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:w-px md:before:bg-border` (부모 relative).
- `src/modules/exam-sessions/exam-sessions.service.ts:124` 부근 스냅샷 조립에 두 카운트 복사.
- `web/lib/types.ts` `SessionQuestionSnapshot`에 `totalSolvedCount?: number; correctSolvedCount?: number;`
- `SolveQuestionCard`/`ResultQuestionCard`에 정답률 배지(조건부).

## 테스트

- 백엔드: 세션 생성 스펙에 스냅샷 카운트 포함 검증 1케이스 추가(기존 exam-sessions.service.spec 패턴).
- 프론트: 시각 변화라 수동 확인(2열 중앙 정렬, 세로선, 배지 조건부 표시).

## 미결(사용자 확인 필요)

- 정답률 표시 위치: 카드 우하단(이미지처럼) vs 카드 헤더 옆. 초안은 우하단.
- 풀이 중에도 정답률을 보여줄지(난이도 힌트가 됨) vs 결과 모드에서만. **초안은 결과 모드에서만** — 풀이 중 정답률은 스포일러성.
