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

| 메서드                 | 경로                                      | 비고                                                                |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| GET / PUT              | `/api/profile`                            | **구현됨** (Phase 2)                                                |
| GET                    | `/api/budgets/today`                      | 오늘 기준 계산 결과                                                 |
| POST                   | `/api/budgets/preview`                    | 계획 확정 전 "하루 생활비 X → Y" 미리보기                           |
| GET · POST · PUT · DEL | `/api/fixed-expenses`, `/api/plans`       |                                                                     |
| GET · POST · PUT · DEL | `/api/transactions`                       |                                                                     |
| GET / POST             | `/api/reconciliations/pending`, `/{date}` | 하루 정산                                                           |
| POST                   | `/api/transactions/import-candidates`     | `source` + 원문(CSV 행, 알림 raw, OCR 텍스트) → 후보 + 중복 정보    |
| POST                   | `/api/transactions/import`                | 확정. `(user_id, source, source_event_id)` 유일 제약으로 idempotent |
| GET                    | `/actuator/health/liveness`, `/readiness` |                                                                     |

오류는 모두 `application/problem+json`이며 `code`로 분기한다: `validation_failed`(400), `not_found`(404), 규칙 위반(422, 예: `income_date_not_future`), `service_unavailable`(503 + `Retry-After`).

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
3. **Domain Migration**: 위 표의 규칙을 서버로 옮기고 Vitest 시나리오를 JUnit으로 이식한다. 테이블은 엔티티와 함께 V2 이후 마이그레이션으로 추가한다.
4. **인증**: Spring Security + Access Token. `CurrentUser` 구현만 교체한다. Android는 Keystore 기반 저장소를 쓸 수 있게 토큰 저장을 분리한다.
5. **Frontend API Migration**: API 계층을 도입하고 localStorage를 Source of Truth에서 단계적으로 제외한다. 실사용 데이터가 없어 localStorage 마이그레이션은 만들지 않는다.
6. **Capacitor**: 기존 React를 Android로 패키징하고 Google · Android 기본 캘린더 연동을 붙인다.
7. **Notification Import**:
   - `NotificationListenerService`는 raw 알림(id, packageName, title, text, bigText, postedAt)만 Native Queue에 저장한다.
   - 앱이 켜지면 Plugin → React → Spring Import API 순서로 전달하고, 서버 저장이 성공한 뒤에만 ACK한다.
   - 금액과 가맹점 판단은 서버가 한다.
