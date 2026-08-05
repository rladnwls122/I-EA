-- #37 복습 실패율 신호: 복습 상태 **전이 이력**.
-- user_question_review_states는 현재 상태만 들고 있어 "복습에서 또 틀림"(X→X)을 셀 수 없었다.
-- append-only 원장이라 나중에 다른 신호(마스터까지 걸린 횟수 등)도 재계산 없이 뽑는다.
CREATE TABLE `user_question_review_transitions` (
  `id`          CHAR(36)    NOT NULL,
  `user_id`     CHAR(36)    NOT NULL,
  `question_id` CHAR(36)    NOT NULL,
  `from_status` VARCHAR(20) NULL,
  `to_status`   VARCHAR(20) NOT NULL,
  `correct`     BOOLEAN     NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `user_question_review_transitions_user_id_occurred_at_idx` (`user_id`, `occurred_at`),
  INDEX `user_question_review_transitions_question_id_idx` (`question_id`)
);

-- #43 gap 8 서술형 채점기준표: [{ id, text, points }] 기준 배열.
-- NULL이면 기존대로 정오 2지선다 자기채점.
ALTER TABLE `questions` ADD COLUMN `rubric` JSON NULL;
