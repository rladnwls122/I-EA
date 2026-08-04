-- 힌트 경제 → AI 크레딧 경제 전환 (HINT_TOKEN 폐기).
--
-- 배경: 응시 중 AI 힌트를 2026-08-04에 폐기하면서 users.hint_free_* 두 컬럼이
-- 아무도 읽지 않는 상태가 됐다. 그런데 그 모양("하루 무료 할당량 + 날짜 리셋")이
-- 후속 AI 크레딧에 그대로 필요해서, 드롭하지 않고 이름만 바꿔 재사용한다.
-- 같은 테이블의 author_reward_date/author_reward_count가 동일 패턴의 쌍둥이다.

ALTER TABLE `users` CHANGE COLUMN `hint_free_date` `ai_free_date` DATE NULL;
ALTER TABLE `users` CHANGE COLUMN `hint_free_used` `ai_free_used` INT NOT NULL DEFAULT 0;

-- 진행 중이던 하루 무료 소진 카운트는 의미가 달라졌으므로(힌트 열람 → 튜터 턴)
-- 이월하지 않는다. 날짜를 비우면 다음 요청에서 자연히 0부터 시작한다.
UPDATE `users` SET `ai_free_date` = NULL, `ai_free_used` = 0;

-- HINT_TOKEN 보유분 리셋. 상점에서 내려간 지 오래고 소모처가 없어져
-- 아무 기능도 없는 재고로만 남아 있었다. 코인 환급은 하지 않는다 —
-- 보유자가 없다는 것을 확인하고 내린 결정이다(2026-08-04).
DELETE FROM `user_inventory` WHERE `item_key` = 'HINT_TOKEN';

-- exam_session_questions.is_hint_used / hint_used_at 은 남긴다.
-- 지금 읽는 코드는 없지만 응시 중 AI 보조가 다시 생기면 그 자리가 필요하고,
-- nullable/default에 인덱스도 없어 유지 비용이 사실상 0이다.
