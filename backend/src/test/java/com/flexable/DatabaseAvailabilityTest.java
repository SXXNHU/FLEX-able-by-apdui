package com.flexable;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.mysql.MySQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 실행 순서 독립성 검증: Backend가 DB보다 먼저 떠도 영구 실패하지 않고, DB가 재시작돼도 스스로 복구한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DatabaseAvailabilityTest {

	static final int DB_PORT = freePort();

	/** 테스트 중간에 시작하므로 호스트 포트를 고정해 두고, 애플리케이션은 처음부터 그 주소를 바라본다. */
	static final MySQLContainer MYSQL = new MySQLContainer(TestcontainersConfiguration.MYSQL)
		.withCreateContainerCmdModifier((cmd) -> cmd.getHostConfig()
			.withPortBindings(new PortBinding(Ports.Binding.bindPort(DB_PORT), new ExposedPort(3306))));

	@LocalServerPort
	int port;

	@DynamicPropertySource
	static void database(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", () -> "jdbc:mysql://localhost:" + DB_PORT + "/test");
		registry.add("spring.datasource.username", () -> "test");
		registry.add("spring.datasource.password", () -> "test");
		registry.add("spring.datasource.hikari.connection-timeout", () -> "1000");
		registry.add("app.schema.retry-initial-delay", () -> "500ms");
		registry.add("app.schema.retry-max-delay", () -> "2s");
	}

	@AfterAll
	static void stopDatabase() {
		MYSQL.stop();
	}

	@Test
	void backendStartsBeforeDatabaseAndRecovers() {
		Http http = new Http(port);
		String profile = """
				{"name":"순서","balance":100000,"incomeDate":"%s","incomeAmount":0,
				 "protectedAmount":0,"protectionCycle":"THIS_PERIOD","cardOutstanding":0}
				""".formatted(LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(5));

		// 1. DB 없음: 프로세스는 살아 있고, 트래픽은 받지 않으며, API는 503으로 재시도를 안내한다.
		assertThat(http.get("/actuator/health/liveness").statusCode()).isEqualTo(200);
		assertThat(http.get("/actuator/health/readiness").statusCode()).isEqualTo(503);
		HttpResponse<String> unavailable = http.post("/api/auth/login",
				"{\"email\":\"a@test.flex\",\"password\":\"password-1234\"}");
		assertThat(unavailable.statusCode()).isEqualTo(503);
		assertThat(unavailable.headers().firstValue("Retry-After")).isPresent();
		assertThat(unavailable.body()).contains("\"code\":\"service_unavailable\"");

		// 2. DB가 뒤늦게 뜨면 재시작 없이 스키마를 만들고 정상화된다.
		MYSQL.start();
		http.await("/actuator/health/readiness", (r) -> r.statusCode() == 200, Duration.ofSeconds(90));
		Http user = Http.signedUp(port);
		assertThat(user.put("/api/profile", profile).statusCode()).isEqualTo(200);

		// 3. 운영 중 DB가 내려가면 readiness DOWN · API 503. 토큰 검증은 DB를 쓰지 않으므로 401이 아닌 503이다.
		var docker = MYSQL.getDockerClient();
		docker.stopContainerCmd(MYSQL.getContainerId()).exec();
		http.await("/actuator/health/readiness", (r) -> r.statusCode() == 503, Duration.ofSeconds(30));
		assertThat(user.get("/api/profile").statusCode()).isEqualTo(503);
		assertThat(http.get("/actuator/health/liveness").statusCode()).isEqualTo(200);

		// 4. DB가 다시 올라오면 커넥션 풀이 재연결하고, 같은 토큰으로 계속 쓴다.
		docker.startContainerCmd(MYSQL.getContainerId()).exec();
		user.await("/api/profile", (r) -> r.statusCode() == 200, Duration.ofSeconds(90));
		assertThat(user.get("/api/profile").body()).contains("\"name\":\"순서\"");
	}

	private static int freePort() {
		try (ServerSocket socket = new ServerSocket(0)) {
			return socket.getLocalPort();
		}
		catch (IOException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
