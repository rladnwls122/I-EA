-- =====================================================================
-- Q-Idea 스키마 확장 (0001) — 3개 영역, 전부 ADD-ONLY (온라인 DDL 안전)
--   1) 정답률 통계     : questions 캐시 컬럼 2개 + 인덱스
--   2) 개인 메모(캔버스) : user_question_memos 신규 (content + canvas)
--   3) 변형문제 추적   : question_variants 조인 테이블 신규
-- 기존 테이블 데이터 재작성 없음. DEFAULT 있는 컬럼 추가 + 신규 테이블뿐.
-- MySQL 8 / TiDB 기준. (Prisma 프로젝트에서는 `prisma migrate dev`가
--  아래와 동등한 SQL을 생성하므로, 이 파일은 수동 적용/리뷰용 레퍼런스입니다.)
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1) 정답률 통계 — questions 캐시 컬럼
--    상세(선지별) 정답률은 기존 즉석 집계(3.13.1)를 그대로 쓰고,
--    "문제 카드/목록에 항상 노출되는 전체 정답률"만 캐시로 뺀다.
--    (목록 렌더마다 exam_session_answers 풀스캔 회피)
--    증가 로직: 자동채점(is_correct NOT NULL) 확정 시 채점 트랜잭션 안에서
--      UPDATE questions
--         SET total_solved_count   = total_solved_count + 1,
--             correct_solved_count = correct_solved_count + :isCorrectInt
--       WHERE id = :questionId;
-- ---------------------------------------------------------------------
ALTER TABLE questions
    ADD COLUMN total_solved_count   INT NOT NULL DEFAULT 0 COMMENT '자동채점된 제출 누적 수',
    ADD COLUMN correct_solved_count INT NOT NULL DEFAULT 0 COMMENT '그 중 정답 수';

CREATE INDEX idx_questions_solved_stats ON questions (total_solved_count);

-- ---------------------------------------------------------------------
-- 2) 개인 메모(캔버스) — user_question_memos
--    "나만의 메모": 문제 종속 · 영속. exam_session_answers.annotations
--    (세션 1회 종속 · 휘발성 필기)와 성격이 다른 별도 저장소.
--    content(텍스트) + canvas(펜 필기)를 한 행에 둔다. 둘 다 nullable —
--    텍스트만/캔버스만/둘 다 있는 메모 모두 허용.
--    canvas 스키마 = annotations와 동일: {version, strokes:[...]}, 좌표 0~1 정규화.
-- ---------------------------------------------------------------------
CREATE TABLE user_question_memos (
    id          CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    user_id     CHAR(36) NOT NULL,
    question_id CHAR(36) NOT NULL,
    content     TEXT     NULL,   -- 텍스트 메모(평문 또는 Tiptap 직렬화)
    canvas      JSON     NULL,   -- 펜 필기 스트로크
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_uqm_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_uqm_question
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
    -- 유저 1명이 문제 1개에 메모 1행 → 저장은 항상 upsert
    CONSTRAINT uq_uqm_user_question UNIQUE (user_id, question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_uqm_user_updated ON user_question_memos (user_id, updated_at);

-- ---------------------------------------------------------------------
-- 3) 변형문제 추적 — question_variants (조인 테이블)
--    variant_group_id(같은 그룹=서로 변형)는 "묶음"만 표현할 뿐,
--    "어느 문제가 어느 문제에서 파생됐는지(계보)"와 "어느 생성 작업이
--    만들었는지"는 표현 못 한다. 그 방향성/출처를 조인 테이블로 명시한다.
--    - source_question_id  : 원본 문제
--    - variant_question_id : 파생된 변형 문제
--    - generation_id       : 이 변형을 만든 ai_generations 작업(있으면)
--    - requested_by        : 변형을 요청한 사용자
--    (컬럼 하나(ai_generations.source_question_id)로 안 두는 이유:
--     한 원본에서 N개 변형, 변형의 변형까지 다대다 계보를 남기기 위함)
-- ---------------------------------------------------------------------
CREATE TABLE question_variants (
    id                  CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    source_question_id  CHAR(36) NOT NULL,
    variant_question_id CHAR(36) NOT NULL,
    generation_id       CHAR(36) NULL,
    requested_by        CHAR(36) NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qv_source
        FOREIGN KEY (source_question_id) REFERENCES questions (id) ON DELETE CASCADE,
    CONSTRAINT fk_qv_variant
        FOREIGN KEY (variant_question_id) REFERENCES questions (id) ON DELETE CASCADE,
    CONSTRAINT fk_qv_generation
        FOREIGN KEY (generation_id) REFERENCES ai_generations (id) ON DELETE SET NULL,
    CONSTRAINT fk_qv_requester
        FOREIGN KEY (requested_by) REFERENCES users (id),
    CONSTRAINT uq_qv_source_variant UNIQUE (source_question_id, variant_question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_qv_source ON question_variants (source_question_id);
