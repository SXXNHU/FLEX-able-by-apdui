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

/** 게스트 시연 데이터 · 메모 · 알림 설정 · 중복 조회 · 초기화 */
@Import({ TestcontainersConfiguration.class, FixedClockConfiguration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserDataApiTest {

	@LocalServerPort
	int port;

	Http anonymous;

	@BeforeEach
	void setUp() {
		anonymous = new Http(port);
		anonymous.await("/actuator/health/readiness", (r) -> r.statusCode() == 200, Duration.ofSeconds(60));
	}

	Http guest(boolean demo) {
		HttpResponse<String> response = anonymous.post("/api/auth/guest",
				"{\"client\":\"NATIVE\",\"demo\":%s}".formatted(demo));
		assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
		return anonymous.withBearer(Http.accessToken(response));
	}

	@Test
	void 게스트_시연_데이터는_기존_앱과_같은_하루_22000원() {
		Http user = guest(true);
		assertThat(user.get("/api/auth/me").body()).contains("\"guest\":true", "\"email\":null");
		assertThat(user.get("/api/budgets/today").body()).contains("\"daily\":22000", "\"balance\":1420000",
				"\"provisional\":true");
		assertThat(user.get("/api/plans").body()).contains("\"date\":\"2026-10-03\"", "\"confirmed\":false");
		assertThat(user.get("/api/transactions").body()).contains("\"title\":\"동네 커피\"", "\"source\":\"DEMO\"");
		assertThat(user.get("/api/memories").body()).contains("데이트 예산 기준");
	}

	@Test
	void 시연_데이터_없는_게스트는_설정부터_시작한다() {
		assertThat(guest(false).get("/api/profile").statusCode()).isEqualTo(404);
	}

	@Test
	void 초기화하면_모든_기록이_지워지고_다시_설정할_수_있다() {
		Http user = guest(true);
		assertThat(user.delete("/api/ledger").statusCode()).isEqualTo(204);
		assertThat(user.get("/api/profile").statusCode()).isEqualTo(404);
		assertThat(user.get("/api/memories").body()).isEqualTo("[]");
		assertThat(user.put("/api/profile", """
				{"name":"새출발","balance":300000,"incomeDate":"2026-10-09","incomeAmount":0,
				 "protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":0}""").statusCode())
			.isEqualTo(200);
		assertThat(user.get("/api/budgets/today").body()).contains("\"daily\":30000");
	}

	@Test
	void 직접_입력_전_같은_결제가_있는지_알려준다() {
		Http user = guest(true);
		HttpResponse<String> found = user.post("/api/transactions/duplicates",
				"{\"title\":\"동네커피\",\"amount\":4500,\"date\":\"2026-09-28\",\"kind\":\"EXPENSE\"}");
		assertThat(found.body()).contains("\"title\":\"동네 커피\"", "\"level\":\"EXACT\"");
		assertThat(user.post("/api/transactions/duplicates",
				"{\"title\":\"동네커피\",\"amount\":4600,\"date\":\"2026-09-28\",\"kind\":\"EXPENSE\"}").body())
			.isEqualTo("[]");
	}

	@Test
	void 메모와_알림_설정() {
		Http user = guest(true);
		String id = UUID.randomUUID().toString();
		assertThat(user.put("/api/memories/" + id, "{\"title\":\"회식\",\"text\":\"다음 날 식비 여유 있게\"}").statusCode())
			.isEqualTo(200);
		assertThat(user.get("/api/memories").body()).contains("\"title\":\"회식\"");
		assertThat(user.delete("/api/memories/" + id).statusCode()).isEqualTo(204);

		assertThat(user.put("/api/profile/settings", "{\"notificationTime\":\"22:30\",\"notificationsEnabled\":true}")
			.body()).contains("\"notificationTime\":\"22:30\"", "\"notificationsEnabled\":true");
		assertThat(user.put("/api/profile/settings", "{\"notificationTime\":\"25:00\",\"notificationsEnabled\":true}")
			.statusCode()).isEqualTo(400);
		// 예산 설정을 저장해도 알림 설정은 유지된다
		user.put("/api/profile", """
				{"name":"플렉서","balance":1420000,"incomeDate":"2026-10-09","incomeAmount":0,
				 "protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":220000}""");
		assertThat(user.get("/api/profile").body()).contains("\"notificationTime\":\"22:30\"");
	}

}
