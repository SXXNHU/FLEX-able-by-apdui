package com.flexable.importing;

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

/** 원문 → 후보 → 확인 → 반영. 중복 확인과 재전송 멱등성을 서버가 보장하는지 확인한다. */
@Import({ TestcontainersConfiguration.class, FixedClockConfiguration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ImportApiTest {

	@LocalServerPort
	int port;

	Http http;

	@BeforeEach
	void setUp() {
		new Http(port).await("/actuator/health/readiness", (r) -> r.statusCode() == 200, Duration.ofSeconds(60));
		http = Http.signedUp(port);
		http.put("/api/profile", """
				{"name":"테스트","balance":300000,"incomeDate":"2026-10-09","incomeAmount":0,
				 "protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":0}""");
		// 캡처로 먼저 등록해 둔 결제
		http.post("/api/transactions", """
				{"id":"%s","title":"스타벅스 강남점","amount":4500,"date":"2026-09-28","category":"CAFE",
				 "kind":"EXPENSE","source":"CAPTURE"}""".formatted(UUID.randomUUID()));
	}

	static final String BANK_CSV = "거래내역 조회,,,\\n거래일시,적요,출금액,입금액\\n"
			+ "2026.09.28 12:30,스타벅스,\\\"4,500\\\",0\\n2026.09.28 19:00,김밥천국,\\\"8,000\\\",0";

	static String item(String id, String title, long amount, String extra) {
		return """
				{"id":"%s","title":"%s","amount":%d,"date":"2026-09-28","category":"CAFE","kind":"EXPENSE"%s}"""
			.formatted(id, title, amount, extra);
	}

	String balance() {
		return http.get("/api/budgets/today").body().replaceAll(".*\"balance\":(\\d+).*", "$1");
	}

	@Test
	void CSV_후보에_기존_거래와의_중복_정보가_붙는다() {
		HttpResponse<String> response = http.post("/api/transactions/import-candidates",
				"{\"source\":\"CSV\",\"text\":\"" + BANK_CSV + "\"}");
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		assertThat(response.body()).contains("\"detected\":true", "\"headerRow\":1", "\"title\":\"스타벅스\"",
				"\"title\":\"김밥천국\"", "\"source\":\"CAPTURE\"", "\"level\":\"LIKELY\"", "\"creditCard\":false");
	}

	@Test
	void 중복_의심은_확인_없이는_반영하지_않고_확인하면_반영한다() {
		String coffee = UUID.randomUUID().toString();
		String kimbap = UUID.randomUUID().toString();
		String items = "[" + item(coffee, "스타벅스", 4500, "") + "," + item(kimbap, "김밥천국", 8000, "") + "]";

		HttpResponse<String> unconfirmed = http.post("/api/transactions/import",
				"{\"source\":\"CSV\",\"items\":" + items + "}");
		assertThat(unconfirmed.statusCode()).isEqualTo(422);
		assertThat(unconfirmed.body()).contains("\"code\":\"duplicate_requires_confirmation\"",
				"\"items\":[\"" + coffee + "\"]");
		assertThat(balance()).isEqualTo("295500");

		String confirmed = "{\"source\":\"CSV\",\"items\":" + items + ",\"acceptDuplicates\":[\"" + coffee + "\"]}";
		HttpResponse<String> first = http.post("/api/transactions/import", confirmed);
		assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
		assertThat(first.body()).contains("\"created\":[\"" + coffee + "\",\"" + kimbap + "\"]", "\"replayed\":[]");
		assertThat(balance()).isEqualTo("283000");

		// 네트워크 오류로 같은 요청을 다시 보내도 한 번만 반영된다
		HttpResponse<String> retry = http.post("/api/transactions/import", confirmed);
		assertThat(retry.body()).contains("\"created\":[]", "\"replayed\":[\"" + coffee + "\",\"" + kimbap + "\"]");
		assertThat(balance()).isEqualTo("283000");
	}

	@Test
	void 같은_알림은_다른_ID로_다시_보내도_한_번만_반영한다() {
		String notification = """
				{"source":"NOTIFICATION","notifications":[{"id":"n-1","packageName":"com.card","title":"",
				 "text":"현대카드 승인 12,500원 09/28 12:34 김밥천국","postedAt":1790566440000}]}""";
		HttpResponse<String> candidates = http.post("/api/transactions/import-candidates", notification);
		assertThat(candidates.body()).contains("\"title\":\"김밥천국\"", "\"method\":\"CARD\"",
				"\"sourceEventId\":\"noti:n-1\"", "\"alreadyImported\":false");

		String body = "{\"source\":\"NOTIFICATION\",\"items\":[" + item(UUID.randomUUID().toString(), "김밥천국", 12500,
				",\"method\":\"CARD\",\"sourceEventId\":\"noti:n-1\"") + "]}";
		assertThat(http.post("/api/transactions/import", body).body()).contains("\"replayed\":[]");
		assertThat(http.get("/api/budgets/today").body()).contains("\"cardOutstanding\":12500");

		HttpResponse<String> again = http.post("/api/transactions/import",
				body.replaceAll("\"id\":\"[^\"]+\"", "\"id\":\"" + UUID.randomUUID() + "\""));
		assertThat(again.body()).contains("\"created\":[]");
		assertThat(http.get("/api/budgets/today").body()).contains("\"cardOutstanding\":12500");
		assertThat(http.post("/api/transactions/import-candidates", notification).body())
			.contains("\"alreadyImported\":true");
	}

	@Test
	void 캡처_문자와_잘못된_가져오기() {
		HttpResponse<String> capture = http.post("/api/transactions/import-candidates",
				"{\"source\":\"CAPTURE\",\"text\":\"2026.09.27\\n점심 9,000원\\n잔액 200,000원\"}");
		assertThat(capture.body()).contains("\"title\":\"점심\"", "\"amount\":9000", "\"date\":\"2026-09-27\"");

		HttpResponse<String> refund = http.post("/api/transactions/import", "{\"source\":\"CSV\",\"items\":["
				+ item(UUID.randomUUID().toString(), "환불", 1000, "").replace("EXPENSE", "REFUND") + "]}");
		assertThat(refund.statusCode()).isEqualTo(400);

		HttpResponse<String> manual = http.post("/api/transactions/import", "{\"source\":\"MANUAL\",\"items\":["
				+ item(UUID.randomUUID().toString(), "점심", 1000, "") + "]}");
		assertThat(manual.statusCode()).isEqualTo(400);
	}

}
