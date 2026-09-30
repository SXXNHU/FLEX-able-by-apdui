package com.flexable.auth;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.Http;
import com.flexable.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthApiTest {

	private static final Pattern REFRESH = Pattern.compile("\"refreshToken\":\"([^\"]+)\"");

	@LocalServerPort
	int port;

	Http http;

	String email;

	@BeforeEach
	void setUp() {
		http = new Http(port);
		http.await("/actuator/health/readiness", (r) -> r.statusCode() == 200, Duration.ofSeconds(60));
		email = UUID.randomUUID() + "@Test.Flex";
	}

	HttpResponse<String> signup(String client) {
		return http.post("/api/auth/signup",
				"{\"email\":\"%s\",\"password\":\"password-1234\",\"client\":\"%s\"}".formatted(email, client));
	}

	HttpResponse<String> login(String password) {
		return http.post("/api/auth/login",
				"{\"email\":\"%s\",\"password\":\"%s\",\"client\":\"NATIVE\"}".formatted(email, password));
	}

	static String refreshToken(HttpResponse<String> response) {
		Matcher m = REFRESH.matcher(response.body());
		assertThat(m.find()).as(response.body()).isTrue();
		return m.group(1);
	}

	static String cookie(HttpResponse<String> response) {
		String header = response.headers().firstValue("Set-Cookie").orElseThrow();
		return header.substring(0, header.indexOf(';'));
	}

	@Test
	void 가입하면_바로_로그인되고_이메일은_소문자로_저장된다() {
		HttpResponse<String> response = signup("NATIVE");
		assertThat(response.statusCode()).isEqualTo(201);
		assertThat(response.body()).contains("\"tokenType\":\"Bearer\"", "\"expiresIn\":900", "\"refreshToken\":\"");
		Http user = http.withBearer(Http.accessToken(response));
		assertThat(user.get("/api/auth/me").body()).contains("\"email\":\"" + email.toLowerCase() + "\"");

		assertThat(signup("NATIVE").statusCode()).isEqualTo(409);
	}

	@Test
	void 잘못된_비밀번호와_없는_계정은_같은_오류() {
		signup("NATIVE");
		HttpResponse<String> wrong = login("wrong-password");
		assertThat(wrong.statusCode()).isEqualTo(401);
		assertThat(wrong.body()).contains("\"code\":\"invalid_credentials\"");
		email = "nobody-" + email;
		assertThat(login("password-1234").body()).isEqualTo(wrong.body());
	}

	@Test
	void 토큰_없이는_데이터_API를_쓸_수_없다() {
		HttpResponse<String> anonymous = http.get("/api/budgets/today");
		assertThat(anonymous.statusCode()).isEqualTo(401);
		assertThat(anonymous.headers().firstValue("Content-Type")).hasValueSatisfying(
				(t) -> assertThat(t).startsWith("application/problem+json"));
		assertThat(anonymous.body()).contains("\"code\":\"unauthorized\"");

		String token = Http.accessToken(signup("NATIVE"));
		String tampered = token.substring(0, token.length() - 2) + (token.endsWith("A") ? "BB" : "AA");
		assertThat(http.withBearer(tampered).get("/api/auth/me").statusCode()).isEqualTo(401);
		assertThat(http.get("/actuator/health/liveness").statusCode()).isEqualTo(200);
	}

	@Test
	void 앱_refresh_token은_쓸_때마다_바뀌고_재사용되면_모두_끊는다() {
		String first = refreshToken(signup("NATIVE"));
		String body = "{\"refreshToken\":\"%s\",\"client\":\"NATIVE\"}";

		HttpResponse<String> rotated = http.post("/api/auth/refresh", body.formatted(first));
		assertThat(rotated.statusCode()).isEqualTo(200);
		String second = refreshToken(rotated);
		assertThat(second).isNotEqualTo(first);

		// 이미 교체된 토큰이 다시 쓰이면 탈취로 보고, 정상 사용자가 가진 새 토큰까지 무효화한다.
		HttpResponse<String> reused = http.post("/api/auth/refresh", body.formatted(first));
		assertThat(reused.statusCode()).isEqualTo(401);
		assertThat(reused.body()).contains("\"code\":\"invalid_refresh_token\"");
		assertThat(http.post("/api/auth/refresh", body.formatted(second)).statusCode()).isEqualTo(401);
	}

	@Test
	void 웹은_refresh_token을_HttpOnly_쿠키로만_주고받는다() {
		HttpResponse<String> response = signup("WEB");
		assertThat(response.body()).contains("\"refreshToken\":null");
		String setCookie = response.headers().firstValue("Set-Cookie").orElseThrow();
		assertThat(setCookie).contains("flexable_refresh=", "HttpOnly", "Secure", "SameSite=Lax", "Path=/api/auth");

		HttpResponse<String> refreshed = http.post("/api/auth/refresh", "{\"client\":\"WEB\"}", "Cookie",
				cookie(response));
		assertThat(refreshed.statusCode()).isEqualTo(200);
		String latest = cookie(refreshed);

		HttpResponse<String> logout = http.post("/api/auth/logout", "{}", "Cookie", latest);
		assertThat(logout.statusCode()).isEqualTo(204);
		assertThat(logout.headers().firstValue("Set-Cookie")).hasValueSatisfying(
				(c) -> assertThat(c).contains("Max-Age=0"));

		HttpResponse<String> afterLogout = http.post("/api/auth/refresh", "{\"client\":\"WEB\"}", "Cookie", latest);
		assertThat(afterLogout.statusCode()).isEqualTo(401);
		assertThat(afterLogout.headers().firstValue("Set-Cookie")).hasValueSatisfying(
				(c) -> assertThat(c).contains("Max-Age=0"));
	}

	@Test
	void 비밀번호를_여러_번_틀리면_잠시_막는다() {
		signup("NATIVE");
		for (int i = 0; i < 5; i++) {
			assertThat(login("wrong-password").statusCode()).isEqualTo(401);
		}
		HttpResponse<String> locked = login("password-1234");
		assertThat(locked.statusCode()).isEqualTo(429);
		assertThat(locked.body()).contains("\"code\":\"too_many_attempts\"");
	}

	@Test
	void 가입_입력_검증() {
		HttpResponse<String> response = http.post("/api/auth/signup",
				"{\"email\":\"not-an-email\",\"password\":\"short\"}");
		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("\"email\"", "\"password\"");
	}

	@Test
	void 앱_출처는_쿠키를_포함한_CORS를_허용한다() {
		HttpResponse<String> preflight = http.preflight("/api/auth/refresh", "http://localhost:5173");
		assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin")).hasValue("http://localhost:5173");
		assertThat(preflight.headers().firstValue("Access-Control-Allow-Credentials")).hasValue("true");
	}

}
