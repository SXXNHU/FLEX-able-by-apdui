-- 결제 알림 등 자동 수집 중 "이미 있는 거래 같아" 바로 반영하지 않고 사용자 확인을 기다리는 거래.
-- 알림 원문은 저장하지 않고 해석한 값만 둔다.
CREATE TABLE pending_imports (
    id              CHAR(36)     NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    title           VARCHAR(60)  NOT NULL,
    amount          BIGINT       NOT NULL,
    tx_date         DATE         NOT NULL,
    category        VARCHAR(20)  NOT NULL,
    kind            VARCHAR(20)  NOT NULL,
    method          VARCHAR(10)  NOT NULL,
    source          VARCHAR(20)  NOT NULL,
    source_event_id VARCHAR(200) NOT NULL,
    created_at      DATETIME(6)  NOT NULL,
    -- 사용자가 "이미 있어요"로 버린 시각. 같은 알림이 다시 와도 되살리지 않도록 행은 남긴다.
    dismissed_at    DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pending_source_event (user_id, source, source_event_id),
    KEY ix_pending_user (user_id, dismissed_at),
    CONSTRAINT fk_pending_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_pending_amount CHECK (amount > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
