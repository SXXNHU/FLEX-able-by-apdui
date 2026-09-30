package com.flexable.importing;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.FixedClockConfiguration;
import com.flexable.Http;
import com.flexable.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

/** 기기 큐 → 수집 API → 자동 반영 · 확인 대기 · 무시. 같은 알림은 몇 번 와도 한 번만 반영된다. */
@Import({ TestcontainersConfiguration.class, FixedClockConfiguration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotificationIngestApiTest {

	static final long POSTED = OffsetDateTime.parse("2026-09-29T12:40:00+09:00").toInstant().toEpochMilli();

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
	}

	static String notification(String id, String text) {
		return """
				{"id":"%s","packageName":"com.card","title":"","text":"%s","postedAt":%d}""".formatted(id, text, POSTED);
	}

	HttpResponse<String> ingest(String... notifications) {
		return http.post("/api/notifications/ingest", "{\"notifications\":[" + String.join(",", notifications) + "]}");
	}

	String budget() {
		return http.get("/api/budgets/today").body();
	}

	@Test
	void 새_결제는_자동으로_반영하고_같은_알림은_한_번만_반영한다() {
		String card = notification("n1", "현대카드 승인 12,500원 09/29 12:34 김밥천국");
		String bank = notification("n2", "출금 3,000원 | 카카오T 택시 | 잔액 100,000원");
		String ad = notification("n3", "(광고) 결제하면 5,000원 할인");

		HttpResponse<String> first = ingest(card, bank, ad);
		assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
		assertThat(first.body()).contains("\"processed\":[\"n1\",\"n2\",\"n3\"]", "\"added\":2", "\"queued\":0",
				"\"ignored\":1");
		assertThat(budget()).contains("\"cardOutstanding\":12500", "\"balance\":297000");

		// 서버 저장 후 기기가 ACK 전에 끊겨 같은 알림을 다시 보낸 경우
		HttpResponse<String> retry = ingest(card, bank);
		assertThat(retry.body()).contains("\"processed\":[\"n1\",\"n2\"]", "\"added\":0", "\"ignored\":2");
		assertThat(budget()).contains("\"cardOutstanding\":12500", "\"balance\":297000");
		assertThat(http.get("/api/transactions").body()).contains("\"source\":\"NOTIFICATION\"");
	}

	@Test
	void 캡처로_이미_등록한_결제는_확인_대기함에_넣고_사용자가_고른다() {
		http.post("/api/transactions", """
				{"id":"%s","title":"김밥천국 강남점","amount":12500,"date":"2026-09-29","category":"FOOD",
				 "kind":"EXPENSE","method":"CARD","source":"CAPTURE"}""".formatted(UUID.randomUUID()));

		assertThat(ingest(notification("dup-1", "현대카드 승인 12,500원 09/29 12:34 김밥천국")).body())
			.contains("\"added\":0", "\"queued\":1");
		assertThat(budget()).contains("\"cardOutstanding\":12500");

		String inbox = http.get("/api/inbox").body();
		assertThat(inbox).contains("\"title\":\"김밥천국\"", "\"source\":\"NOTIFICATION\"", "\"title\":\"김밥천국 강남점\"");
		String id = firstId(inbox);

		// 이미 있어요 → 반영하지 않고, 같은 알림이 다시 와도 되살리지 않는다
		assertThat(http.delete("/api/inbox/" + id).statusCode()).isEqualTo(204);
		assertThat(http.get("/api/inbox").body()).isEqualTo("[]");
		assertThat(ingest(notification("dup-1", "현대카드 승인 12,500원 09/29 12:34 김밥천국")).body())
			.contains("\"ignored\":1");
		assertThat(http.get("/api/inbox").body()).isEqualTo("[]");

		// 다른 알림은 따로 추가를 고르면 반영된다
		ingest(notification("dup-2", "현대카드 승인 12,500원 09/29 18:00 김밥천국"));
		String second = firstId(http.get("/api/inbox").body());
		assertThat(http.post("/api/inbox/" + second + "/accept", "").statusCode()).isEqualTo(204);
		assertThat(budget()).contains("\"cardOutstanding\":25000");
		assertThat(ingest(notification("dup-2", "현대카드 승인 12,500원 09/29 18:00 김밥천국")).body())
			.contains("\"ignored\":1");
	}

	@Test
	void 로그인과_예산_설정이_필요하다() {
		assertThat(new Http(port).post("/api/notifications/ingest", "{\"notifications\":[]}").statusCode())
			.isEqualTo(401);
		Http fresh = Http.signedUp(port);
		assertThat(fresh.post("/api/notifications/ingest", "{\"notifications\":[]}").statusCode()).isEqualTo(404);
	}

	private static String firstId(String json) {
		Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
		assertThat(m.find()).as(json).isTrue();
		return m.group(1);
	}

}
