package com.flexable.auth;

import org.springframework.http.HttpStatus;

/** 로그인 · 토큰 갱신 실패. 원인을 자세히 알려주지 않는다 (계정 존재 여부 노출 방지). */
public class AuthException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	AuthException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}

	static AuthException invalidCredentials() {
		return new AuthException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않아요.");
	}

	static AuthException invalidRefreshToken() {
		return new AuthException(HttpStatus.UNAUTHORIZED, "invalid_refresh_token", "로그인이 만료됐어요. 다시 로그인해주세요.");
	}

	static AuthException tooManyAttempts() {
		return new AuthException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts",
				"로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.");
	}

	public static AuthException unauthorized() {
		return new AuthException(HttpStatus.UNAUTHORIZED, "unauthorized", "로그인이 필요해요. 다시 로그인해주세요.");
	}

}
