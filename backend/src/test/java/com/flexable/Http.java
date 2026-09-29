package com.flexable;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.function.Predicate;

/** 테스트용 최소 HTTP 도우미. 실제 포트로 요청해 필터 · 인터셉터 · 오류 처리까지 함께 검증한다. */
public final class Http {

	private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	private final String base;

	public Http(int port) {
		this.base = "http://localhost:" + port;
	}

	public HttpResponse<String> get(String path) {
		return send(HttpRequest.newBuilder(URI.create(base + path)).GET());
	}

	public HttpResponse<String> put(String path, String json) {
		return send(HttpRequest.newBuilder(URI.create(base + path))
			.header("Content-Type", "application/json")
			.PUT(HttpRequest.BodyPublishers.ofString(json)));
	}

	public HttpResponse<String> preflight(String path, String origin) {
		return send(HttpRequest.newBuilder(URI.create(base + path))
			.header("Origin", origin)
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
