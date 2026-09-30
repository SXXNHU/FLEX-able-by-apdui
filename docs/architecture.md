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

| 메서드           | 경로                                      | 상태 · 비고                                                                                                                                                          |
| ---------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET · PUT        | `/api/profile`                            | 구현                                                                                                                                                                 |
| GET              | `/api/budgets/today`                      | 구현. 계산 결과와 미확인 날짜(`pending`)                                                                                                                             |
| POST             | `/api/budgets/preview?planId=`            | 구현. 계획 확정 전후 비교 (저장 안 함)                                                                                                                               |
| GET · PUT · DEL  | `/api/plans`, `/api/plans/{id}`           | 구현. 클라이언트 UUID로 upsert. 실제 사용액 · 남은 확보액 · 정산 여부 포함                                                                                           |
| GET              | `/api/plans/estimate?category=`           | 구현. 기록 없으면 204                                                                                                                                                |
| GET · PUT · DEL  | `/api/fixed-expenses`, `/{id}`            | 구현                                                                                                                                                                 |
| GET · POST       | `/api/transactions`                       | 구현. POST의 `id`가 멱등 키: 같은 요청 재전송은 200(반영 없음), 다른 내용은 409                                                                                      |
| PUT · DEL        | `/api/transactions/{id}`                  | 구현. 수정은 되돌린 뒤 다시 반영 (출처 유지)                                                                                                                         |
| GET · POST       | `/api/reconciliations`, `/{date}`         | 구현                                                                                                                                                                 |
| POST             | `/api/transactions/import-candidates`     | 구현. `CSV`(디코딩된 텍스트, 열 지정 선택) · `CAPTURE`(OCR 문자) · `NOTIFICATION`(원문) → 후보 + 기존 거래와의 중복 + 같은 요청 안 중복 + 이미 반영 여부             |
| POST             | `/api/transactions/import`                | 구현. 전부 반영 또는 전부 거절. 확인 안 된 중복은 422 `duplicate_requires_confirmation`(+ `items`). 같은 항목 ID · 같은 `sourceEventId` 재전송은 `replayed`로 건너뜀 |
| GET              | `/actuator/health/liveness`, `/readiness` | 구현                                                                                                                                                                 |
| POST             | `/api/budgets/simulate`                   | 구현. 저장 전 입력값으로 계산 (설정 화면)                                                                                                                            |
| POST             | `/api/transactions/duplicates`            | 구현. 직접 입력 전 같은 결제 확인                                                                                                                                    |
| GET · PUT · DEL  | `/api/memories`, `/{id}`                  | 구현. 소비 기준 메모                                                                                                                                                 |
| PUT              | `/api/profile/settings`                   | 구현. 정산 알림 설정                                                                                                                                                 |
| DELETE           | `/api/ledger`                             | 구현. 예산 설정과 모든 기록 초기화 (계정 유지)                                                                                                                       |
| POST             | `/api/notifications/ingest`               | 구현. 기기 알림 원문 → 자동 반영 · 확인 대기 · 무시. 응답의 `processed`만 기기 큐에서 ACK                                                                            |
| GET · POST · DEL | `/api/inbox`, `/{id}/accept`, `/{id}`     | 구현. 확인 대기함 조회 · 따로 추가 · 이미 있어요(버린 알림은 다시 와도 되살리지 않음)                                                                                |
| POST             | `/api/auth/guest`                         | 구현. 가입 없이 둘러보기 (`demo: true`면 시연 데이터, IP당 시간당 제한)                                                                                              |

열거값은 영문 코드다. 카테고리는 `FOOD`(식비) · `CAFE` · `TRANSPORT` · `SHOPPING` · `CULTURE` · `SOCIAL`(약속) · `HOUSING` · `ETC`이고, 거래 종류는 `EXPENSE` · `INCOME` · `REFUND` · `TRANSFER` · `CARD_PAYMENT`, 결제는 `CASH` · `CARD`다.

오류는 모두 `application/problem+json`이며 `code`로 분기한다: `validation_failed` · `malformed_request`(400), `not_found`(404), `conflict`(409), 규칙 위반(422: `future_date`, `card_payment_exceeds`, `refund_exceeds_original`, `refund_exists`, `plan_has_transactions`, `plan_date_past` 등), `service_unavailable`(503 + `Retry-After`).

## 백엔드 구조

```text
com.flexable
├─ common        설정 · 오류(ProblemDetail) · 스키마 준비(SchemaMigrator, readiness)
├─ auth          Spring Security 설정, 가입 · 로그인 · 토큰 발급과 교체, JwtCurrentUser
├─ user          사용자 엔티티, CurrentUser 인터페이스
├─ profile       잔액 · 수입일 · 보호액 · 카드 미결제액 설정
├─ ledger
   ├─ domain       Ledger: domain.ts 규칙의 Java 이식 (DB 무관, LedgerTest)
   ├─ persistence  JPA 엔티티 · 저장소 · LedgerStore(사용자 원장 로드, 프로필 행 잠금)
   ├─ application  거래 · 계획 · 고정지출 · 예산 · 정산 서비스
   └─ api          REST 컨트롤러
└─ importing     원문 → 후보(CSV · 캡처 · 알림 파서), 중복 판정, 멱등 가져오기
```

- 계획 · 거래 · 고정지출은 모두 한 사용자의 원장을 함께 보고 판단한다(계획 확보액, 환불 한도, 카드 미결제액). 그래서 기능별 패키지로 나누지 않고 `ledger` 하나로 묶었다.
- 쓰기 작업은 모두 프로필 행을 `SELECT … FOR UPDATE`로 잠근 뒤 원장을 읽는다. 같은 사용자의 동시 요청은 이 잠금으로 줄을 서므로 잔액 변경이 유실되지 않는다.

## 인증

| 메서드 | 경로                | 설명                                                                   |
| ------ | ------------------- | ---------------------------------------------------------------------- |
| POST   | `/api/auth/signup`  | `{email, password, client}` → 201 + 토큰 (이미 가입된 이메일은 409)    |
| POST   | `/api/auth/login`   | 실패는 항상 401 `invalid_credentials`. 5번 연속 실패하면 15분 동안 429 |
| POST   | `/api/auth/refresh` | Refresh Token 교체. 새 Access · Refresh Token을 준다                   |
| POST   | `/api/auth/logout`  | 이 로그인에서 나온 Refresh Token을 모두 무효화하고 쿠키를 지운다       |
| GET    | `/api/auth/me`      | 현재 사용자                                                            |

- **Access Token**
  - HS256 JWT이고 유효 시간은 15분이다. `sub`가 사용자 ID다.
  - 요청마다 서명과 만료만 검사하므로 DB 장애 중에도 인증이 동작한다. 이때 데이터 API는 401이 아니라 503을 반환한다.
  - 클라이언트는 메모리에만 보관한다.
- **Refresh Token**
  - 무작위 256비트 값이고 DB에는 SHA-256 해시만 저장한다.
  - 쓸 때마다 새 값으로 교체한다. 이미 교체된 토큰이 다시 오면 탈취로 보고 같은 로그인의 토큰을 전부 무효화한다.
  - 클라이언트는 갱신 요청을 한 번에 하나만 보내야 한다. 두 탭이 같은 토큰으로 동시에 갱신하면 재사용으로 판정돼 로그아웃된다.
- **Refresh Token 전달 방식** (`client`)
  - `WEB`: `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` 쿠키로만 주고받아 스크립트가 읽을 수 없다. 요청은 `credentials: 'include'`로 보낸다.
  - `NATIVE`: 응답 본문으로 준다. Android 앱은 Keystore 기반 보안 저장소에 둔다.
  - 장기 자격 증명은 어느 경우에도 localStorage에 두지 않는다.
- **CSRF**
  - 쿠키는 `/api/auth` 경로에만 전송되고 SameSite=Lax다.
  - refresh는 JSON 본문을 요구하므로 교차 사이트 폼으로 호출할 수 없다.
  - 그 외 API는 쿠키가 아니라 Bearer 헤더로 인증하므로 CSRF 대상이 아니다.
- **한계**: 로그인 시도 제한은 인스턴스 메모리에 둔다. 백엔드를 여러 대로 늘리면 공유 저장소로 옮겨야 한다.

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
  - 모든 호출은 `src/api/client.ts`를 거친다. 이 계층이 타임아웃(10초), 네트워크 오류 · 503 · 5xx, ProblemDetail 해석, 연결 상태 알림을 맡는다.
  - 401을 받으면 토큰 갱신을 한 번만(single-flight) 하고 원래 요청을 다시 보낸다.
  - 부팅 중 서버에 닿지 않으면 연결 오류 화면과 다시 연결 버튼을 보여준다. 사용 중 연결이 끊기면 마지막 데이터와 상단 안내를 보여준다.
  - API 주소는 `/config.json`(컨테이너가 `API_BASE_URL`로 생성) → `VITE_API_BASE_URL` → 같은 호스트 8080 순서로 정한다. 다시 빌드하지 않고 백엔드 주소를 바꿀 수 있다.
- **Compose**
  - `depends_on` 없이 서비스별 `healthcheck`만 둔다.
  - 각 서비스를 `docker compose up <service>`로 따로 띄울 수 있고, compose 없이 `npm run dev`와 `./gradlew bootRun`으로도 개발할 수 있다.

## 단계

1. **Architecture Foundation**: 이 문서
2. **Backend Foundation** (완료): Spring Boot 4.1 · JPA · MySQL · Flyway · Actuator probes · ProblemDetail · CORS · 환경변수 설정 · Testcontainers 테스트 · Docker
3. **Domain Migration**
   - 3a (완료): 원장 규칙과 API를 구현하고, `domain.test.ts`의 예산 시나리오를 `LedgerTest`로 옮겼다. `LedgerApiTest`는 같은 규칙을 HTTP와 MySQL 위에서 멱등성 · 동시성까지 확인한다.
   - 3b (완료): 중복 판정(`DuplicateFinder`)과 CSV · 캡처 · 결제 알림 파서를 이식했다. `imports.test.ts` 시나리오는 `ImportParsersTest`로 옮겼다. 가져오기 API는 서버가 중복을 최종 판정하고 멱등성을 보장한다.
   - 이식하지 않은 것: `bankRows`(계좌 중계 API 연동 시 서버가 직접 호출하므로 불필요)와 `autoIngest` · 확인 대기함(Phase 7에서 알림 수집 API와 함께 구현).
4. **인증** (완료): 아래 "인증" 절 참고. 개발용 고정 사용자와 `X-Dev-User-Id` 헤더는 제거했다.
5. **Frontend API Migration** (완료)
   - 화면은 서버 데이터만 쓴다. localStorage 저장, JSON 복원, 클라이언트 예산 계산 · 거래 반영 · 중복 판정 · CSV/알림 파서는 제거했다 (서버 테스트가 같은 시나리오를 검증).
   - 클라이언트에 남은 것: 표시 · 날짜 유틸, 자연어 계획 · `.ics` 파싱(저장 전 사용자 확인), CSV 인코딩 판별, 브라우저 OCR.
   - 서버에 추가한 것: 게스트 둘러보기(시연 데이터), 메모, 알림 설정, 직접 입력용 중복 조회, 설정 화면용 예산 미리 계산(`/api/budgets/simulate`), 전체 초기화.
   - E2E는 실제 백엔드 · MySQL로 실행한다. 실사용 localStorage 데이터가 없어 마이그레이션은 만들지 않았다.
6. **Capacitor** (완료)
   - `android/`: Capacitor 8 (minSdk 24, target 36)이다. 네이티브 플러그인 `FlexNative`는 기기 기능만 노출한다.
   - 보안 저장소: Android Keystore AES-GCM. 앱의 Refresh Token을 보관한다.
   - 기기 캘린더: 동기화된 Google 캘린더를 포함해 읽는다. 일정 추가는 캘린더 앱의 추가 화면을 연다.
   - 웹은 Google 캘린더 추가 링크와, 클라이언트 ID가 있으면 Google Calendar API 읽기 전용 가져오기를 쓴다.
   - CI가 디버그 APK를 빌드하고 lint를 돌린다.
7. **Notification Import** (완료)
   - `PaymentNotificationListener`는 금액과 결제 단어가 있는 알림의 원문(id, packageName, title, text, bigText, postedAt)만 네이티브 큐에 넣는다. id는 알림 키와 게시 시각의 해시다.
   - 앱이 켜지거나 화면에 돌아오면 큐를 `/api/notifications/ingest`로 보낸다. 서버가 해석하고, 중복 판정 후 자동 반영하거나 확인 대기함에 넣는다.
   - 응답의 `processed`만 큐에서 ACK하므로, 전송이 실패하면 다음에 다시 보낸다.
   - 멱등성은 `(user_id, source, source_event_id)` 유일 제약(거래 · 대기함)으로 보장한다.
   - 알림 원문은 저장하지 않는다.
