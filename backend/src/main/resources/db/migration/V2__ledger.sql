-- 원장: 고정지출 · 계획 · 거래 · 하루 정산. 규칙 검증은 애플리케이션(Ledger)이 하고, DB는 참조 무결성과 기본 범위를 지킨다.

ALTER TABLE profiles ADD COLUMN last_reconciled_at DATETIME(6) NULL;

CREATE TABLE fixed_expenses (
    id         CHAR(36)    NOT NULL,
    user_id    CHAR(36)    NOT NULL,
    title      VARCHAR(40) NOT NULL,
    amount     BIGINT      NOT NULL,
    due_date   DATE        NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_fixed_user (user_id, due_date),
    CONSTRAINT fk_fixed_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_fixed_amount CHECK (amount > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE plans (
    id         CHAR(36)     NOT NULL,
    user_id    CHAR(36)     NOT NULL,
    title      VARCHAR(60)  NOT NULL,
    amount     BIGINT       NOT NULL,
    plan_date  DATE         NOT NULL,
    category   VARCHAR(20)  NOT NULL,
    confirmed  BOOLEAN      NOT NULL,
    note       VARCHAR(500) NOT NULL,
    created_at DATETIME(6)  NOT NULL,
    updated_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    KEY ix_plans_user (user_id, plan_date),
    CONSTRAINT fk_plans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_plans_amount CHECK (amount >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE transactions (
    id              CHAR(36)     NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    title           VARCHAR(60)  NOT NULL,
    amount          BIGINT       NOT NULL,
    tx_date         DATE         NOT NULL,
    category        VARCHAR(20)  NOT NULL,
    kind            VARCHAR(20)  NOT NULL,
    method          VARCHAR(10)  NOT NULL,
    plan_id         CHAR(36)     NULL,
    fixed_id        CHAR(36)     NULL,
    refund_of       CHAR(36)     NULL,
    closes_item     BOOLEAN      NOT NULL,
    source          VARCHAR(20)  NOT NULL,
    -- 알림 · 계좌 연동 등 외부 이벤트 ID. 같은 이벤트가 여러 번 전달돼도 거래는 한 번만 생긴다.
    source_event_id VARCHAR(200) NULL,
    created_at      DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tx_source_event (user_id, source, source_event_id),
    KEY ix_tx_user_date (user_id, tx_date),
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_tx_plan FOREIGN KEY (plan_id) REFERENCES plans (id),
    CONSTRAINT fk_tx_fixed FOREIGN KEY (fixed_id) REFERENCES fixed_expenses (id),
    CONSTRAINT fk_tx_refund FOREIGN KEY (refund_of) REFERENCES transactions (id),
    CONSTRAINT ck_tx_amount CHECK (amount > 0),
    CONSTRAINT ck_tx_single_link CHECK (plan_id IS NULL OR fixed_id IS NULL)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE reconciled_dates (
    user_id CHAR(36) NOT NULL,
    day     DATE     NOT NULL,
    PRIMARY KEY (user_id, day),
    CONSTRAINT fk_reconciled_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
