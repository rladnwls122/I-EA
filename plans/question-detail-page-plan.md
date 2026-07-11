# SP-A 문항 상세 페이지 (`/questions/[id]`) — 구현 계획

스펙: docs/superpowers/specs/2026-07-11-question-detail-page-design.md
백엔드 변경 없음. 프론트 전용.

## 실측한 백엔드 계약
- `GET /questions/:id` — 문항+subject+tags+`_count`+correctRatePercent (기존 `useQuestion`)
- `GET /questions/:id/stats` — `{totalSolved, correctRate, avgTimeSpentSec, timedSampleCount, choiceDistribution[]}` (기존 `useQuestionStats`)
- `GET /questions/:id/reviews` — `{summary:{averageRating, averagePerceivedDifficulty}, items: QuestionReview[]}` (신규 연동)
- `PUT /questions/:id/reviews` — upsert `{rating(1~5)!, perceivedDifficulty?, reviewText?}` (신규 연동)
- 댓글 — 기존 `useComments`/`useCreateComment`

## 파일
- 수정 `web/lib/types.ts` — `QuestionReview`, `ReviewsResponse`
- 수정 `web/lib/api.ts` — `fetchReviews`/`upsertReview`
- 수정 `web/lib/hooks.ts` — `useReviews`/`useUpsertReview`
- 신규 `web/app/questions/[id]/page.tsx` — `?reveal=1` 파싱
- 신규 `web/components/question-detail/QuestionDetail.tsx` — 셸: 헤더(뒤로/브레드크럼/[채점결과↔문제탐색] 토글) + 좌(본문)/우(댓글 376px) 2열
- 신규 `QuestionArticle.tsx` — 메타/stem/선지(reveal시 채점색)
- 신규 `ExplanationPanel.tsx` — 해설 접이식(reveal시만)
- 신규 `StatsPanel.tsx` — 정답률/평균소요/분포바(reveal시만 렌더)
- 신규 `RatingPanel.tsx` — 별점 등록(rating+체감난이도)
- 신규 `CommentSidebar.tsx` — 댓글 목록+입력([풀이토론/Q&A] 세그먼트는 시각만)

## 게이팅
reveal=false(문제탐색): 선지 중립색, 해설/통계/정답 숨김(표시상 처리 — 스펙에 명시된 한계).
reveal=true(채점결과): 정답 선지 초록, 해설·통계 공개. 헤더 토글로 전환.

## 검증
tsc --noEmit. 서버 기동 검증은 사용자 지시로 생략.

## 완료 기록
(구현 후 갱신)
## 완료 기록 (2026-07-12)
- Completed: /questions/[id] 전체(게이팅/통계/별점/댓글), 결과카드 상세링크 배선(52011010)
- Changed: lib(types/api/hooks)+components/question-detail 6개+라우트
- Validation: tsc clean, 리뷰 subagent ready-to-ship(0 findings)
