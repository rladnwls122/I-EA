-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `nickname` VARCHAR(100) NOT NULL,
    `creator_bio` TEXT NULL,
    `xp` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 1,
    `last_active_date` DATE NULL,
    `current_streak` INTEGER NOT NULL DEFAULT 0,
    `longest_streak` INTEGER NOT NULL DEFAULT 0,
    `xp_boost_until` DATETIME(3) NULL,
    `coins` INTEGER NOT NULL DEFAULT 0,
    `equipped_title` VARCHAR(60) NULL,
    `name_color` VARCHAR(20) NULL,
    `hint_free_date` DATE NULL,
    `hint_free_used` INTEGER NOT NULL DEFAULT 0,
    `author_reward_date` DATE NULL,
    `author_reward_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `xp_history` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `breakdown` JSON NULL,
    `exam_session_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `xp_history_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_achievements` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `milestone_key` VARCHAR(40) NOT NULL,
    `achieved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `milestone_achievements_user_id_milestone_key_key`(`user_id`, `milestone_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subjects` (
    `id` CHAR(36) NOT NULL,
    `exam_type` VARCHAR(50) NOT NULL DEFAULT '수능',
    `exam_category` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `subjects_exam_type_exam_category_sort_order_idx`(`exam_type`, `exam_category`, `sort_order`),
    UNIQUE INDEX `subjects_exam_type_exam_category_name_key`(`exam_type`, `exam_category`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` CHAR(36) NOT NULL,
    `role` ENUM('CREATOR', 'CONSUMER', 'ADMIN') NOT NULL,

    PRIMARY KEY (`user_id`, `role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generations` (
    `id` CHAR(36) NOT NULL,
    `creator_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `input_params` JSON NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_generations_creator_id_idx`(`creator_id`),
    INDEX `ai_generations_subject_id_idx`(`subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `passages` (
    `id` CHAR(36) NOT NULL,
    `creator_id` CHAR(36) NOT NULL,
    `generation_id` CHAR(36) NULL,
    `content` JSON NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `passages_creator_id_idx`(`creator_id`),
    INDEX `passages_generation_id_idx`(`generation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` CHAR(36) NOT NULL,
    `creator_id` CHAR(36) NOT NULL,
    `generation_id` CHAR(36) NULL,
    `subject_id` CHAR(36) NOT NULL,
    `passage_id` CHAR(36) NULL,
    `question_type` VARCHAR(20) NOT NULL,
    `stem` JSON NOT NULL,
    `choices` JSON NULL,
    `explanation` JSON NULL,
    `correct_answer_text` TEXT NULL,
    `difficulty` TINYINT NOT NULL DEFAULT 3,
    `points` DECIMAL(6, 2) NOT NULL DEFAULT 1.00,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `metadata` JSON NULL,
    `autosaved_at` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `search_text` TEXT NULL,
    `hint_content` TEXT NULL,
    `total_solved_count` INTEGER NOT NULL DEFAULT 0,
    `correct_solved_count` INTEGER NOT NULL DEFAULT 0,
    `solve_bonus_awarded` BOOLEAN NOT NULL DEFAULT false,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `total_time_spent_sec` INTEGER NOT NULL DEFAULT 0,
    `timed_solved_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `questions_status_idx`(`status`),
    INDEX `questions_subject_id_status_idx`(`subject_id`, `status`),
    INDEX `questions_total_solved_count_idx`(`total_solved_count`),
    INDEX `questions_view_count_idx`(`view_count`),
    INDEX `questions_creator_id_idx`(`creator_id`),
    INDEX `questions_generation_id_idx`(`generation_id`),
    INDEX `questions_passage_id_idx`(`passage_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` CHAR(36) NOT NULL,
    `passage_id` CHAR(36) NULL,
    `question_id` CHAR(36) NULL,
    `generation_id` CHAR(36) NULL,
    `uploader_id` CHAR(36) NOT NULL,
    `asset_type` ENUM('IMAGE') NOT NULL,
    `storage_url` VARCHAR(500) NOT NULL,
    `width_px` INTEGER NULL,
    `height_px` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `media_assets_passage_id_idx`(`passage_id`),
    INDEX `media_assets_question_id_idx`(`question_id`),
    INDEX `media_assets_generation_id_idx`(`generation_id`),
    INDEX `media_assets_uploader_id_idx`(`uploader_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_tags` (
    `question_id` CHAR(36) NOT NULL,
    `tag_id` CHAR(36) NOT NULL,

    INDEX `question_tags_tag_id_idx`(`tag_id`),
    PRIMARY KEY (`question_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NULL,
    `workbook_id` CHAR(36) NULL,
    `is_review` BOOLEAN NOT NULL DEFAULT false,
    `filter_criteria` JSON NOT NULL,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'EXPIRED') NOT NULL DEFAULT 'IN_PROGRESS',
    `started_at` DATETIME(3) NULL,
    `submitted_at` DATETIME(3) NULL,
    `duration_sec` INTEGER NULL,

    INDEX `exam_sessions_workbook_id_status_idx`(`workbook_id`, `status`),
    INDEX `exam_sessions_user_id_idx`(`user_id`),
    INDEX `exam_sessions_subject_id_idx`(`subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_session_questions` (
    `id` CHAR(36) NOT NULL,
    `exam_session_id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `display_order` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `is_hint_used` BOOLEAN NOT NULL DEFAULT false,
    `hint_used_at` DATETIME(3) NULL,

    INDEX `exam_session_questions_question_id_idx`(`question_id`),
    INDEX `exam_session_questions_exam_session_id_idx`(`exam_session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_session_answers` (
    `id` CHAR(36) NOT NULL,
    `exam_session_question_id` CHAR(36) NOT NULL,
    `selected_choice_ids` JSON NULL,
    `answer_text` TEXT NULL,
    `is_correct` BOOLEAN NULL,
    `annotations` JSON NULL,
    `time_spent_sec` INTEGER NULL,
    `answered_at` DATETIME(3) NULL,

    UNIQUE INDEX `exam_session_answers_exam_session_question_id_key`(`exam_session_question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_reviews` (
    `id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `reviewer_id` CHAR(36) NOT NULL,
    `rating` TINYINT NOT NULL,
    `perceived_difficulty` TINYINT NULL,
    `review_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `question_reviews_reviewer_id_idx`(`reviewer_id`),
    UNIQUE INDEX `question_reviews_question_id_reviewer_id_key`(`question_id`, `reviewer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_comments` (
    `id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `author_id` CHAR(36) NOT NULL,
    `parent_comment_id` CHAR(36) NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `question_comments_question_id_created_at_idx`(`question_id`, `created_at`),
    INDEX `question_comments_author_id_idx`(`author_id`),
    INDEX `question_comments_parent_comment_id_idx`(`parent_comment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_question_annotations` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `target` VARCHAR(20) NOT NULL DEFAULT 'STEM',
    `target_id` VARCHAR(36) NULL,
    `mark_style` VARCHAR(20) NOT NULL DEFAULT 'HIGHLIGHT',
    `color` VARCHAR(20) NOT NULL DEFAULT 'yellow',
    `selected_text` TEXT NULL,
    `selection_range` JSON NULL,
    `reason_code` VARCHAR(20) NULL,
    `memo_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_question_annotations_user_id_question_id_idx`(`user_id`, `question_id`),
    INDEX `user_question_annotations_user_id_updated_at_idx`(`user_id`, `updated_at`),
    INDEX `user_question_annotations_user_id_reason_code_idx`(`user_id`, `reason_code`),
    INDEX `user_question_annotations_question_id_idx`(`question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_choice_stats` (
    `question_id` CHAR(36) NOT NULL,
    `choice_id` VARCHAR(36) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`question_id`, `choice_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbooks` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `cover_image_url` VARCHAR(500) NULL,
    `visibility` VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
    `forked_from_id` CHAR(36) NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `fork_count` INTEGER NOT NULL DEFAULT 0,
    `question_count` INTEGER NOT NULL DEFAULT 0,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `score_sum_percent` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workbooks_visibility_view_count_idx`(`visibility`, `view_count`),
    INDEX `workbooks_owner_id_updated_at_idx`(`owner_id`, `updated_at`),
    INDEX `workbooks_forked_from_id_idx`(`forked_from_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbook_tags` (
    `workbook_id` CHAR(36) NOT NULL,
    `tag_id` CHAR(36) NOT NULL,

    INDEX `workbook_tags_tag_id_idx`(`tag_id`),
    PRIMARY KEY (`workbook_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workbook_questions` (
    `workbook_id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `display_order` INTEGER NOT NULL,
    `source_workbook_id` CHAR(36) NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workbook_questions_question_id_idx`(`question_id`),
    INDEX `workbook_questions_source_workbook_id_idx`(`source_workbook_id`),
    PRIMARY KEY (`workbook_id`, `question_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `loot_boxes` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `tier` ENUM('COMMON', 'RARE', 'LEGENDARY') NOT NULL,
    `exam_session_id` CHAR(36) NULL,
    `reward_coins` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `opened_at` DATETIME(3) NULL,

    INDEX `loot_boxes_user_id_opened_at_idx`(`user_id`, `opened_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_inventory` (
    `user_id` CHAR(36) NOT NULL,
    `item_key` VARCHAR(50) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`user_id`, `item_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `item_key` VARCHAR(50) NOT NULL,
    `coin_cost` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'FULFILLED') NOT NULL DEFAULT 'FULFILLED',
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `purchases_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `purchases_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coin_history` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` ENUM('BOX_OPEN', 'PURCHASE', 'AUTHOR_PUBLISH', 'WORKBOOK_FORK', 'SOLVE_MILESTONE') NOT NULL,
    `reference_id` CHAR(36) NULL,
    `balance_after` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `coin_history_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
