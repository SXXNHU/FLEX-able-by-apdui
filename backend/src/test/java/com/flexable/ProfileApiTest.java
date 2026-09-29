package com.flexable;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProfileApiTest {

	@LocalServerPort
	int port;

	Http http;

	@BeforeEach
	void waitUntilReady() {
		http = new Http(port);
		http.await("/actuator/health/readiness", (r) -> r.statusCode() == 200, Duration.ofSeconds(60));
	}

	static String profile(LocalDate incomeDate) {
		return """
				{"name":" 플렉서 ","balance":300000,"incomeDate":"%s","incomeAmount":2800000,
				 "protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":0}
				""".formatted(incomeDate);
	}

	@Test
	void healthGroupsAreSeparated() {
		assertThat(http.get("/actuator/health/liveness").statusCode()).isEqualTo(200);
		assertThat(http.get("/actuator/health/readiness").body()).contains("\"UP\"");
	}

	@Test
	void profileLifecycle() {
		LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

		HttpResponse<String> past = http.put("/api/profile", profile(today));
		assertThat(past.statusCode()).isEqualTo(422);
		assertThat(past.body()).contains("\"code\":\"income_date_not_future\"");

		HttpResponse<String> saved = http.put("/api/profile", profile(today.plusDays(10)));
		assertThat(saved.statusCode()).isEqualTo(200);
		assertThat(saved.body()).contains("\"name\":\"플렉서\"", "\"trackingStart\":\"" + today.minusDays(1) + "\"");

		assertThat(http.get("/api/profile").body()).contains("\"balance\":300000");
	}

	@Test
	void validationErrorsListFields() {
		HttpResponse<String> response = http.put("/api/profile", """
				{"name":"","balance":0,"incomeAmount":-1,"protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":0}
				""");
		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
				(type) -> assertThat(type).startsWith("application/problem+json"));
		assertThat(response.body()).contains("\"code\":\"validation_failed\"", "\"name\"", "\"incomeDate\"",
				"\"incomeAmount\"");
	}

	@Test
	void corsAllowsAppOriginsOnly() {
		assertThat(http.preflight("/api/profile", "http://localhost:5173").headers()
			.firstValue("Access-Control-Allow-Origin")).hasValue("http://localhost:5173");
		assertThat(http.preflight("/api/profile", "https://localhost").headers()
			.firstValue("Access-Control-Allow-Origin")).hasValue("https://localhost");
		assertThat(http.preflight("/api/profile", "https://evil.example").statusCode()).isEqualTo(403);
	}

}
