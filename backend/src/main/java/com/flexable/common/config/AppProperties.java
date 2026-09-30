package com.flexable.common.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(Cors cors, Schema schema, Auth auth) {

	public record Cors(List<String> allowedOrigins) {
	}

	public record Schema(Duration retryInitialDelay, Duration retryMaxDelay) {
	}

	/**
	 * @param jwtSecret Base64 HMAC 키 (32바이트 이상). 비우면 실행할 때마다 임시 키를 만든다 (재시작 시 로그아웃).
	 * @param refreshCookie 웹 클라이언트용 refresh token 쿠키
	 */
	public record Auth(String jwtSecret, String issuer, Duration accessTokenTtl, Duration refreshTokenTtl,
			RefreshCookie refreshCookie, LoginThrottle loginThrottle) {
	}

	public record RefreshCookie(String name, boolean secure, String sameSite) {
	}

	/** 같은 이메일로 {@code maxFailures}번 틀리면 {@code lockDuration} 동안 로그인을 막는다. */
	public record LoginThrottle(int maxFailures, Duration lockDuration) {
	}

}
