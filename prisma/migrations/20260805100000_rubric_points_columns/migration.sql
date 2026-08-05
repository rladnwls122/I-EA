-- #43 gap 8 후속: 서술형 부분점수를 SQL로 집계할 수 있게 숫자만 컬럼으로 꺼낸다.
-- 채점 근거 전체는 계속 annotations.rubricGrading(Json)에 남는다 — 여기는 집계용 사본이다.
-- (MySQL JSON 함수는 TiDB 호환 때문에 쓰지 않기로 했으므로 Json 안의 값은 집계 대상이 못 된다.)
--
-- 배포는 `prisma db push`가 정본이라 이 파일은 기록용이다. 컬럼 **추가**뿐이므로
-- --accept-data-loss 없이도 안전하다(삭제였다면 db push가 거부한다).
ALTER TABLE `exam_session_answers`
  ADD COLUMN `earned_points` DECIMAL(8, 2) NULL,
  ADD COLUMN `rubric_total_points` DECIMAL(8, 2) NULL;
