-- 발급된 JWT를 서버가 무효화하기 위한 세대 번호.
-- 토큰에 발급 시점 값을 심고, 검증 시 현재 값과 다르면 거부한다.
-- 로그아웃(전체 기기)·비밀번호 변경 시 +1 한다.
ALTER TABLE `users` ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 0;
