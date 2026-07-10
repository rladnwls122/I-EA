-- =====================================================================
-- Q-Idea 스키마 확장 (0001) — 2개 영역, 전부 ADD-ONLY (온라인 DDL 안전)
--   1) 정답률 통계     : questions 캐시 컬럼 2개 + 인덱스
--   2) 개인 메모(캔버스) : user_question_memos 신규 (content + canvas)
-- 기존 테이블 데이터 재작성 없음. DEFAULT 있는 컬럼 추가 + 신규 테이블뿐.
-- MySQL 8 / TiDB 기준. (Prisma 프로젝트에서는 `prisma db push`가
--  스키마와 동등한 SQL을 생성하므로, 이 파일은 수동 적용/리뷰용 레퍼런스입니다.)
-- 참고(MVP): 변형문제(question_variants)는 스키마에서 제거되었습니다.
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
-- 2) 오답노트 2.0 — user_question_annotations
--    텍스트 범위에 앵커된 하이라이트/밑줄 + 오답원인 태그 + 플로팅 메모.
--    문제당 여러 개 가능(하이라이트 1개 = 1행) → UNIQUE(user,question) 없음.
--    selected_text/selection_range가 NULL이면 문항 전체 대상 일반 메모.
--    reason_code(오답원인)는 /me/notes의 원인별 통계(byReason)를 구동한다.
--    (펜 필기는 exam_session_answers.annotations로 분리 — 세션 1회 종속)
-- ---------------------------------------------------------------------
CREATE TABLE user_question_annotations (
    id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    user_id         CHAR(36)    NOT NULL,
    question_id     CHAR(36)    NOT NULL,
    target          VARCHAR(20) NOT NULL DEFAULT 'STEM', -- GENERAL|PASSAGE|STEM|CHOICES|EXPLANATION
    target_id       VARCHAR(36) NULL,                    -- 지문/선지 앵커 (없으면 NULL)
    mark_style      VARCHAR(20) NOT NULL DEFAULT 'HIGHLIGHT', -- HIGHLIGHT|UNDERLINE
    color           VARCHAR(20) NOT NULL DEFAULT 'yellow',
    selected_text   TEXT        NULL,   -- 하이라이트 원본 문구(일반 메모는 NULL)
    selection_range JSON        NULL,   -- 정밀 오프셋(재앵커용)
    reason_code     VARCHAR(20) NULL,   -- CONCEPT|MISTAKE|TIME|OTHER (통계용 태그)
    memo_text       TEXT        NULL,   -- 플로팅 메모 내용
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_uqa_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_uqa_question
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_uqa_user_question ON user_question_annotations (user_id, question_id);
CREATE INDEX idx_uqa_user_updated  ON user_question_annotations (user_id, updated_at);
CREATE INDEX idx_uqa_user_reason   ON user_question_annotations (user_id, reason_code);
