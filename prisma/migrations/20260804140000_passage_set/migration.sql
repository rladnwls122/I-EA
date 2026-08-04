-- 지문 세트(#43) — 함께 읽어야 풀리는 지문 묶음.
--
-- 수능 (가)(나) 주제통합과 토익 Part 7 double/triple은 문항이 두세 지문을 교차
-- 참조해야 풀린다. Question.passageId가 단수라 응시자가 지문 하나만 보고 있었고,
-- 통합 추론 문항은 사실상 풀 수 없는 상태였다.
--
-- 추가만 한다 — 기존 지문은 setId NULL(세트 아님), setOrder 0으로 그대로 동작한다.

ALTER TABLE `passages`
  ADD COLUMN `set_id` CHAR(36) NULL,
  ADD COLUMN `set_order` INT NOT NULL DEFAULT 0,
  ADD COLUMN `label` VARCHAR(20) NULL;

CREATE INDEX `passages_set_id_idx` ON `passages`(`set_id`);

-- 이미 생성된 다중지문 세트 소급 복구는 하지 않는다.
-- generationId로 추정할 수는 있지만, 한 생성이 독립 세트를 여럿 낸 경우와
-- 구분할 방법이 없어 잘못 묶을 위험이 있다. 재생성이 더 싸고 안전하다.
