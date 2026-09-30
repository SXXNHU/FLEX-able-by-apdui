-- 정산 알림 설정, 소비 기준 메모, 게스트(가입 없이 둘러보기) 사용자

ALTER TABLE profiles
    ADD COLUMN notification_time     CHAR(5) NOT NULL DEFAULT '21:00',
    ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 게스트는 이메일 · 비밀번호 없이 토큰으로만 접근한다.
ALTER TABLE users ADD COLUMN guest BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE memories (
    id         CHAR(36)     NOT NULL,
    user_id    CHAR(36)     NOT NULL,
    title      VARCHAR(40)  NOT NULL,
    body       VARCHAR(500) NOT NULL,
    created_at DATETIME(6)  NOT NULL,
    updated_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    KEY ix_memories_user (user_id, created_at),
    CONSTRAINT fk_memories_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
