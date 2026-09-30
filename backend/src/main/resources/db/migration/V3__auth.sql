-- 이메일 · 비밀번호 로그인과 refresh token.
-- Phase 2~3의 개발용 고정 사용자는 자격 증명이 없어 로그인할 수 없다 (실사용 데이터 없음).

ALTER TABLE users
    ADD COLUMN email         VARCHAR(254) NULL,
    ADD COLUMN password_hash VARCHAR(100) NULL,
    ADD UNIQUE KEY uk_users_email (email);

-- 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다.
-- family_id: 한 번의 로그인에서 이어진 토큰 묶음. 교체된 토큰이 다시 쓰이면(탈취 의심) 묶음 전체를 무효화한다.
CREATE TABLE refresh_tokens (
    id         CHAR(36)    NOT NULL,
    user_id    CHAR(36)    NOT NULL,
    family_id  CHAR(36)    NOT NULL,
    token_hash CHAR(64)    NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    used_at    DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_refresh_hash (token_hash),
    KEY ix_refresh_family (family_id),
    KEY ix_refresh_user (user_id),
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
