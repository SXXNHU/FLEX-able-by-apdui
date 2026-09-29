-- 금액은 모두 원 단위 정수(BIGINT). 날짜는 사용자 기준(Asia/Seoul) 달력 날짜(DATE).

CREATE TABLE users (
    id         CHAR(36)    NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE profiles (
    user_id          CHAR(36)    NOT NULL,
    name             VARCHAR(20) NOT NULL,
    balance          BIGINT      NOT NULL,
    income_date      DATE        NOT NULL,
    income_amount    BIGINT      NOT NULL,
    protected_amount BIGINT      NOT NULL,
    protection_cycle VARCHAR(20) NOT NULL,
    card_outstanding BIGINT      NOT NULL,
    tracking_start   DATE        NOT NULL,
    version          BIGINT      NOT NULL,
    updated_at       DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_profiles_income CHECK (income_amount >= 0),
    CONSTRAINT ck_profiles_protected CHECK (protected_amount >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
