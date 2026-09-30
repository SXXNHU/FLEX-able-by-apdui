package com.flexable;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 테스트용 최소 HTTP 도우미. 실제 포트로 요청해 보안 필터 · 인터셉터 · 오류 처리까지 함께 검증한다. */
public final class Http {

	private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	private static final Pattern ACCESS_TOKEN = Pattern.compile("\"accessToken\":\"([^\"]+)\"");

	private final String base;

	private final String bearer;

	public Http(int port) {
		this(port, null);
	}

	private Http(int port, String bearer) {
		this.base = "http://localhost:" + port;
		this.bearer = bearer;
	}

	/** 새 사용자로 가입하고 그 Access Token을 쓰는 클라이언트. 테스트마다 사용자를 나눠 데이터를 격리한다. */
	public static Http signedUp(int port) {
		HttpResponse<String> response = new Http(port).post("/api/auth/signup", """
				{"email":"%s@test.flex","password":"password-1234","client":"NATIVE"}""".formatted(UUID.randomUUID()));
		if (response.statusCode() != 201) {
			throw new AssertionError("signup failed: " + response.statusCode() + " " + response.body());
		}
		return new Http(port, accessToken(response));
	}

	public static String accessToken(HttpResponse<String> response) {
		Matcher m = ACCESS_TOKEN.matcher(response.body());
		if (!m.find()) {
			throw new AssertionError("no access token: " + response.body());
		}
		return m.group(1);
	}

	public Http withBearer(String token) {
		return new Http(Integer.parseInt(base.substring(base.lastIndexOf(':') + 1)), token);
	}

	public HttpResponse<String> get(String path, String... headers) {
		return send(request(path, headers).GET());
	}

	public HttpResponse<String> put(String path, String json) {
		return send(request(path).header("Content-Type", "application/json")
			.PUT(HttpRequest.BodyPublishers.ofString(json)));
	}

	public HttpResponse<String> post(String path, String json, String... headers) {
		return send(request(path, headers).header("Content-Type", "application/json")
			.POST(HttpRequest.BodyPublishers.ofString(json)));
	}

	public HttpResponse<String> delete(String path) {
		return send(request(path).DELETE());
	}

	public HttpResponse<String> preflight(String path, String origin) {
		return send(request(path).header("Origin", origin)
			.header("Access-Control-Request-Method", "PUT")
			.method("OPTIONS", HttpRequest.BodyPublishers.noBody()));
	}

	/** 조건을 만족할 때까지 기다린다. 서비스 준비 상태 전환처럼 비동기로 바뀌는 값을 확인할 때 쓴다. */
	public HttpResponse<String> await(String path, Predicate<HttpResponse<String>> condition, Duration timeout) {
		long deadline = System.nanoTime() + timeout.toNanos();
		HttpResponse<String> last = get(path);
		while (!condition.test(last)) {
			if (System.nanoTime() > deadline) {
				throw new AssertionError("Timed out waiting for " + path + ", last: " + last.statusCode() + " "
						+ last.body());
			}
			try {
				Thread.sleep(500);
			}
			catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
				throw new AssertionError(ex);
			}
			last = get(path);
		}
		return last;
	}

	private HttpRequest.Builder request(String path, String... headers) {
		HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base + path));
		if (bearer != null) {
			builder.header("Authorization", "Bearer " + bearer);
		}
		for (int i = 0; i + 1 < headers.length; i += 2) {
			builder.header(headers[i], headers[i + 1]);
		}
		return builder;
	}

	private static HttpResponse<String> send(HttpRequest.Builder request) {
		try {
			return CLIENT.send(request.timeout(Duration.ofSeconds(20)).build(), HttpResponse.BodyHandlers.ofString());
		}
		catch (IOException ex) {
			throw new AssertionError(ex);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new AssertionError(ex);
		}
	}

}
