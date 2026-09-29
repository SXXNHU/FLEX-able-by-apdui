package com.flexable.ledger;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

import com.flexable.FixedClockConfiguration;
import com.flexable.Http;
import com.flexable.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 원장 규칙을 실제 HTTP · MySQL로 확인한다. 날짜는 클라이언트 Vitest와 같은 2026-09-29(KST)로 고정한다. 테스트마다
 * 다른 사용자를 써서 서로의 데이터에 영향을 주지 않는다.
 */
@Import({ TestcontainersConfiguration.class, FixedClockConfiguration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = "app.dev-auth.header-enabled=true")
class LedgerApiTest {

	@LocalServerPort
	int port;

	Http http;

	@BeforeEach
	void setUp() {
		new Http(port).await("/actuator/health/readiness", (r) -> r.statusCode() == 200, Duration.ofSeconds(60));
		http = new Http(port, UUID.randomUUID().toString());
		HttpResponse<String> profile = http.put("/api/profile", """
				{"name":"테스트","balance":300000,"incomeDate":"2026-10-09","incomeAmount":2800000,
				 "protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":0}""");
		assertThat(profile.statusCode()).isEqualTo(200);
	}

	static String tx(String id, long amount, String extra) {
		return """
				{"id":"%s","title":"점심","amount":%d,"date":"2026-09-29","category":"FOOD","kind":"EXPENSE"%s}"""
			.formatted(id, amount, extra);
	}

	static String plan(long amount) {
		return """
				{"title":"데이트","amount":%d,"date":"2026-10-03","category":"SOCIAL","confirmed":true,"note":""}"""
			.formatted(amount);
	}

	HttpResponse<String> budget() {
		return http.get("/api/budgets/today");
	}

	@Test
	void 설정_직후_하루_30000원_잠정_금액() {
		assertThat(budget().body()).contains("\"days\":10", "\"daily\":30000", "\"provisional\":true",
				"\"pending\":[\"2026-09-28\"]");
	}

	@Test
	void 계획_확정_전후_비교와_확보() {
		String planId = UUID.randomUUID().toString();
		HttpResponse<String> preview = http.post("/api/budgets/preview", plan(80_000));
		assertThat(preview.body()).contains("\"current\":{", "\"daily\":30000", "\"preview\":{", "\"daily\":22000");
		assertThat(http.get("/api/budgets/today").body()).contains("\"daily\":30000");

		assertThat(http.put("/api/plans/" + planId, plan(80_000)).statusCode()).isEqualTo(200);
		assertThat(budget().body()).contains("\"daily\":22000", "\"plannedReserve\":80000");

		// 7만 원으로 정산 → 1만 원이 생활비로 돌아와 하루 23,000원
		http.post("/api/transactions",
				tx(UUID.randomUUID().toString(), 70_000, ",\"planId\":\"" + planId + "\",\"closesItem\":true"));
		assertThat(budget().body()).contains("\"daily\":23000", "\"plannedReserve\":0", "\"generalToday\":0");
		assertThat(http.get("/api/plans").body()).contains("\"actual\":70000", "\"closed\":true");
		assertThat(http.get("/api/plans/estimate?category=SOCIAL").body()).contains("\"suggested\":70000");

		HttpResponse<String> deletePlan = http.delete("/api/plans/" + planId);
		assertThat(deletePlan.statusCode()).isEqualTo(422);
		assertThat(deletePlan.body()).contains("\"code\":\"plan_has_transactions\"");
	}

	@Test
	void 같은_거래를_다시_보내도_한_번만_반영한다() {
		String id = UUID.randomUUID().toString();
		var first = http.post("/api/transactions", tx(id, 10_000, ""));
		assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
		HttpResponse<String> replay = http.post("/api/transactions", tx(id, 10_000, ""));
		assertThat(replay.statusCode()).isEqualTo(200);
		assertThat(budget().body()).contains("\"balance\":290000", "\"todayRemaining\":20000");

		HttpResponse<String> different = http.post("/api/transactions", tx(id, 12_000, ""));
		assertThat(different.statusCode()).isEqualTo(409);
		assertThat(budget().body()).contains("\"balance\":290000");
	}

	@Test
	void 카드_소비_납부_환불() {
		String card = UUID.randomUUID().toString();
		http.post("/api/transactions", tx(card, 10_000, ",\"method\":\"CARD\""));
		assertThat(budget().body()).contains("\"balance\":300000", "\"cardOutstanding\":10000",
				"\"todayRemaining\":20000");

		HttpResponse<String> tooMuch = http.post("/api/transactions",
				tx(UUID.randomUUID().toString(), 20_000, "").replace("EXPENSE", "CARD_PAYMENT"));
		assertThat(tooMuch.statusCode()).isEqualTo(422);
		assertThat(tooMuch.body()).contains("\"code\":\"card_payment_exceeds\"");

		// 환불은 요청의 결제수단(CASH)과 무관하게 원거래(CARD)를 따른다
		HttpResponse<String> refund = http.post("/api/transactions", tx(UUID.randomUUID().toString(), 6_000,
				",\"method\":\"CASH\",\"refundOf\":\"" + card + "\"").replace("EXPENSE", "REFUND"));
		assertThat(refund.statusCode()).isEqualTo(201);
		assertThat(refund.body()).contains("\"method\":\"CARD\"");
		assertThat(budget().body()).contains("\"balance\":300000", "\"cardOutstanding\":4000");

		HttpResponse<String> deleteOriginal = http.delete("/api/transactions/" + card);
		assertThat(deleteOriginal.statusCode()).isEqualTo(422);
		assertThat(deleteOriginal.body()).contains("\"code\":\"refund_exists\"");
	}

	@Test
	void 거래_수정과_삭제는_잔액을_정확히_되돌린다() {
		String id = UUID.randomUUID().toString();
		http.post("/api/transactions", tx(id, 10_000, ""));
		assertThat(http.put("/api/transactions/" + id, tx(id, 15_000, "")).statusCode()).isEqualTo(200);
		assertThat(budget().body()).contains("\"balance\":285000", "\"generalToday\":15000");
		assertThat(http.delete("/api/transactions/" + id).statusCode()).isEqualTo(204);
		assertThat(budget().body()).contains("\"balance\":300000", "\"generalToday\":0");
	}

	@Test
	void 하루_정산과_거래_추가_시_정산_해제() {
		assertThat(http.post("/api/reconciliations/2026-09-28", "").statusCode()).isEqualTo(200);
		assertThat(budget().body()).contains("\"provisional\":false", "\"lastReconciledAt\":\"2026-09-29T06:00:00Z\"");

		http.post("/api/transactions", tx(UUID.randomUUID().toString(), 5_000, "").replace("2026-09-29", "2026-09-28"));
		assertThat(budget().body()).contains("\"provisional\":true", "\"pending\":[\"2026-09-28\"]");

		HttpResponse<String> future = http.post("/api/reconciliations/2026-09-30", "");
		assertThat(future.statusCode()).isEqualTo(422);
	}

	@Test
	void 고정지출_납부는_확보액과_잔액을_함께_줄인다() {
		String rent = UUID.randomUUID().toString();
		http.put("/api/fixed-expenses/" + rent, """
				{"title":"월세","amount":100000,"date":"2026-10-01"}""");
		String before = budget().body();
		assertThat(before).contains("\"fixedReserve\":100000", "\"rawRemaining\":200000");
		http.post("/api/transactions",
				tx(UUID.randomUUID().toString(), 100_000, ",\"fixedId\":\"" + rent + "\",\"closesItem\":true"));
		assertThat(budget().body()).contains("\"fixedReserve\":0", "\"rawRemaining\":200000", "\"balance\":200000");
		assertThat(http.delete("/api/fixed-expenses/" + rent).statusCode()).isEqualTo(422);
	}

	@Test
	void 규칙_위반과_입력_오류를_구분한다() {
		HttpResponse<String> future = http.post("/api/transactions",
				tx(UUID.randomUUID().toString(), 1_000, "").replace("2026-09-29", "2026-09-30"));
		assertThat(future.statusCode()).isEqualTo(422);
		assertThat(future.body()).contains("\"code\":\"future_date\"");

		HttpResponse<String> invalid = http.post("/api/transactions", tx(UUID.randomUUID().toString(), 0, ""));
		assertThat(invalid.statusCode()).isEqualTo(400);
		assertThat(invalid.body()).contains("\"amount\"");

		HttpResponse<String> importOnly = http.post("/api/transactions",
				tx(UUID.randomUUID().toString(), 1_000, ",\"source\":\"NOTIFICATION\""));
		assertThat(importOnly.statusCode()).isEqualTo(400);

		HttpResponse<String> pastPlan = http.put("/api/plans/" + UUID.randomUUID(),
				plan(10_000).replace("2026-10-03", "2026-09-28"));
		assertThat(pastPlan.body()).contains("\"code\":\"plan_date_past\"");
	}

	@Test
	void 동시에_들어온_거래도_잔액_변경을_잃지_않는다() throws Exception {
		try (var pool = java.util.concurrent.Executors.newFixedThreadPool(10)) {
			var results = pool.invokeAll(java.util.stream.IntStream.range(0, 20)
				.mapToObj((i) -> (java.util.concurrent.Callable<Integer>) () -> http
					.post("/api/transactions", tx(UUID.randomUUID().toString(), 1_000, ""))
					.statusCode())
				.toList());
			for (var result : results) {
				assertThat(result.get()).isEqualTo(201);
			}
		}
		assertThat(budget().body()).contains("\"balance\":280000", "\"generalToday\":20000");
	}

	@Test
	void 다른_사용자의_데이터는_보이지_않는다() {
		String id = UUID.randomUUID().toString();
		http.post("/api/transactions", tx(id, 10_000, ""));
		Http other = new Http(port, UUID.randomUUID().toString());
		assertThat(other.get("/api/budgets/today").statusCode()).isEqualTo(404);
		assertThat(other.delete("/api/transactions/" + id).statusCode()).isEqualTo(404);
	}

}
