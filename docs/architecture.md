# 3-Tier 전환 설계

현재 앱은 브라우저 localStorage에 모든 데이터를 두고 `src/domain.ts`에서 예산 규칙을 처리한다. 최종 목표는 **Spring Boot + MySQL을 데이터와 비즈니스 규칙의 Source of Truth로 두는 3-Tier 구조**다. 한 번에 다시 쓰지 않고 테스트로 동작을 고정한 뒤 단계적으로 옮긴다.

```text
Presentation   React + Vite (루트) · Capacitor Android · Native Plugin
      │ REST / JSON (ProblemDetail 오류)
Application    Spring Boot (backend/)      ← 선택: FastAPI AI (후보 생성 보조, 없어도 핵심 기능 동작)
      │ JDBC (HikariCP)
Data           MySQL 8.4
```

## 책임 구분

| 영역     | 담당                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spring   | 예산 · 하루 사용 가능액 계산, 거래 확정 · 삭제 · 환불, 카드 미결제액, 계획 확정 · 취소 · 정산, 고정지출, 하루 정산 상태, 가져오기 후보 생성과 중복 최종 판정, idempotency, 사용자 권한, 금액 상태 변경의 트랜잭션 |
| Frontend | 화면과 입력, UX용 사전 검증(최종 판단 아님), 브라우저 OCR(이미지 → 텍스트), CSV 파일 디코딩과 표 분리, 자연어 계획 초안(AI 서버 전까지), 서버 연결 상태 표시와 재시도                                             |
| MySQL    | 영속 데이터와 제약(유일성 · FK · CHECK)                                                                                                                                                                           |

## `src/domain.ts` 규칙 목록 → 이전 대상

| 규칙                                                                                  | 현재 위치                                      | 이전                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| 예산 계산 (구간 = 오늘 ~ 수입일 전날, 일반 생활비, 하루 기준액, 오늘 남은 돈, 부족액) | `budget`                                       | `budget` 패키지 `BudgetCalculator`                     |
| 돈의 이동 (현금/카드 지출, 환불, 수입, 카드대금 납부, 이체)                           | `applyMoney`                                   | `transaction`                                          |
| 거래 등록 검증 · 환불 한도 · 환불의 결제수단/연결 계승                                | `addTransaction`                               | `transaction`                                          |
| 거래 삭제 (연결된 환불 먼저 삭제)                                                     | `removeTransaction`                            | `transaction`                                          |
| 계획 · 고정지출 실제 사용액, 잔여 확보액, 정산 완료                                   | `actualFor` `remainingFor` `isClosed`          | `plan` `fixedexpense`                                  |
| 미확인 날짜, 거래 변경 시 정산 해제                                                   | `pendingDates`                                 | `reconcile`                                            |
| 계획 금액 제안                                                                        | `estimateFromHistory`                          | `plan`                                                 |
| 출처가 다른 같은 결제 판정                                                            | `findDuplicates`                               | `importing`                                            |
| CSV 행 · 결제 알림 · 계좌 응답 → 거래 후보, 자동 등록 보류함                          | `src/imports.ts`                               | `importing`                                            |
| 자연어 계획 · OCR 텍스트 · `.ics` 파싱                                                | `parsePlan` `parseCaptureText` `parseCalendar` | 당분간 클라이언트 입력 보조. AI 도입 시 서버 후보 생성 |
| 저장 형식 검증                                                                        | `validateState`                                | 서버 전환 후 제거 (Bean Validation + DB 제약)          |

`src/domain.test.ts`, `src/imports.test.ts`의 시나리오를 서버 테스트로 먼저 옮기고, 같은 결과가 나오는 것을 확인한 뒤 프론트를 API로 바꾼다. 클라이언트 쪽 중복 로직은 그다음에 지운다.

## API 계약

| 메서드          | 경로                                      | 상태 · 비고                                                                     |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| GET · PUT       | `/api/profile`                            | 구현                                                                            |
| GET             | `/api/budgets/today`                      | 구현. 계산 결과와 미확인 날짜(`pending`)                                        |
| POST            | `/api/budgets/preview?planId=`            | 구현. 계획 확정 전후 비교 (저장 안 함)                                          |
| GET · PUT · DEL | `/api/plans`, `/api/plans/{id}`           | 구현. 클라이언트 UUID로 upsert. 실제 사용액 · 남은 확보액 · 정산 여부 포함      |
| GET             | `/api/plans/estimate?category=`           | 구현. 기록 없으면 204                                                           |
| GET · PUT · DEL | `/api/fixed-expenses`, `/{id}`            | 구현                                                                            |
| GET · POST      | `/api/transactions`                       | 구현. POST의 `id`가 멱등 키: 같은 요청 재전송은 200(반영 없음), 다른 내용은 409 |
| PUT · DEL       | `/api/transactions/{id}`                  | 구현. 수정은 되돌린 뒤 다시 반영 (출처 유지)                                    |
| GET · POST      | `/api/reconciliations`, `/{date}`         | 구현                                                                            |
| POST            | `/api/transactions/import-candidates`     | 3b. `source` + 원문 → 후보 + 중복 정보                                          |
| POST            | `/api/transactions/import`                | 3b. `(user_id, source, source_event_id)` 유일 제약으로 idempotent               |
| GET             | `/actuator/health/liveness`, `/readiness` | 구현                                                                            |

열거값은 영문 코드다. 카테고리는 `FOOD`(식비) · `CAFE` · `TRANSPORT` · `SHOPPING` · `CULTURE` · `SOCIAL`(약속) · `HOUSING` · `ETC`이고, 거래 종류는 `EXPENSE` · `INCOME` · `REFUND` · `TRANSFER` · `CARD_PAYMENT`, 결제는 `CASH` · `CARD`다.

오류는 모두 `application/problem+json`이며 `code`로 분기한다: `validation_failed` · `malformed_request`(400), `not_found`(404), `conflict`(409), 규칙 위반(422: `future_date`, `card_payment_exceeds`, `refund_exceeds_original`, `refund_exists`, `plan_has_transactions`, `plan_date_past` 등), `service_unavailable`(503 + `Retry-After`).

## 백엔드 구조

```text
com.flexable
├─ common        설정 · 오류(ProblemDetail) · 스키마 준비(SchemaMigrator, readiness)
├─ user          CurrentUser (인증 전: 개발용 고정 사용자)
├─ profile       잔액 · 수입일 · 보호액 · 카드 미결제액 설정
└─ ledger
   ├─ domain       Ledger: domain.ts 규칙의 Java 이식 (DB 무관, LedgerTest)
   ├─ persistence  JPA 엔티티 · 저장소 · LedgerStore(사용자 원장 로드, 프로필 행 잠금)
   ├─ application  거래 · 계획 · 고정지출 · 예산 · 정산 서비스
   └─ api          REST 컨트롤러
```

- 계획 · 거래 · 고정지출은 모두 한 사용자의 원장을 함께 보고 판단한다(계획 확보액, 환불 한도, 카드 미결제액). 그래서 기능별 패키지로 나누지 않고 `ledger` 하나로 묶었다.
- 쓰기 작업은 모두 프로필 행을 `SELECT … FOR UPDATE`로 잠근 뒤 원장을 읽는다. 같은 사용자의 동시 요청은 이 잠금으로 줄을 서므로 잔액 변경이 유실되지 않는다.

## 독립 실행 · 실행 순서 무관

- **Backend ↔ DB**
  - HikariCP `initialization-fail-timeout=-1`로 DB가 없어도 프로세스가 뜬다.
  - Hibernate는 `hibernate.boot.allow_jdbc_metadata_access=false`와 dialect/버전 명시로 부팅 중 DB에 접속하지 않는다.
  - Flyway는 Spring 기동 시 실행하지 않고, `SchemaMigrator`가 백그라운드에서 지수 백오프로 재시도한다.
  - `liveness`는 프로세스 상태만, `readiness`는 `readinessState + db + schema`를 본다.
  - DB가 없거나 스키마 준비 전이면 API는 503과 `Retry-After`로 응답한다.
  - DB가 운영 중 재시작되면 HikariCP가 다시 연결한다. 자체 커넥션 관리 코드는 없다.
  - `DatabaseAvailabilityTest`가 "Backend 먼저 기동 → DB 기동 → 정상화 → DB 중지 → 503 → DB 재기동 → 복구"를 실제 MySQL 컨테이너로 검증한다.
- **Frontend ↔ Backend**
  - 정적 파일이라 Backend 없이도 뜬다.
  - Phase 4에서 `src/api/client.ts` 공통 계층(타임아웃, 5xx/네트워크 오류 처리, readiness 확인과 재시도)과 런타임 설정(`config.json`)으로 API 주소를 주입한다.
- **Compose**
  - `depends_on` 없이 서비스별 `healthcheck`만 둔다.
  - 각 서비스를 `docker compose up <service>`로 따로 띄울 수 있고, compose 없이 `npm run dev`와 `./gradlew bootRun`으로도 개발할 수 있다.

## 단계

1. **Architecture Foundation**: 이 문서
2. **Backend Foundation** (완료): Spring Boot 4.1 · JPA · MySQL · Flyway · Actuator probes · ProblemDetail · CORS · 환경변수 설정 · Testcontainers 테스트 · Docker
3. **Domain Migration**
   - 3a (완료): 원장 규칙과 API를 구현하고, `domain.test.ts`의 예산 시나리오를 `LedgerTest`로 옮겼다. `LedgerApiTest`는 같은 규칙을 HTTP와 MySQL 위에서 멱등성 · 동시성까지 확인한다.
   - 3b: 중복 판정, 가져오기 후보 생성, idempotent 가져오기.
4. **인증**: Spring Security + Access Token. `CurrentUser` 구현만 교체한다. Android는 Keystore 기반 저장소를 쓸 수 있게 토큰 저장을 분리한다.
5. **Frontend API Migration**: API 계층을 도입하고 localStorage를 Source of Truth에서 단계적으로 제외한다. 실사용 데이터가 없어 localStorage 마이그레이션은 만들지 않는다.
6. **Capacitor**: 기존 React를 Android로 패키징하고 Google · Android 기본 캘린더 연동을 붙인다.
7. **Notification Import**:
   - `NotificationListenerService`는 raw 알림(id, packageName, title, text, bigText, postedAt)만 Native Queue에 저장한다.
   - 앱이 켜지면 Plugin → React → Spring Import API 순서로 전달하고, 서버 저장이 성공한 뒤에만 ACK한다.
   - 금액과 가맹점 판단은 서버가 한다.
