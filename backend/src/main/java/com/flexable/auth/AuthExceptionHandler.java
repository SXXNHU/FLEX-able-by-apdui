package com.flexable.auth;

import java.net.URI;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 공통 핸들러의 catch-all보다 먼저 선택되도록 우선순위를 높인다. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class AuthExceptionHandler {

	@ExceptionHandler(AuthException.class)
	ResponseEntity<ProblemDetail> auth(AuthException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
		problem.setType(URI.create("https://flex-able.app/problems/" + ex.code()));
		problem.setProperty("code", ex.code());
		var response = ResponseEntity.status(ex.status());
		if (ex.status().value() == 401) {
			response.header(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
		}
		if (ex instanceof AuthController.CookieClearingAuthException clearing) {
			response.header(HttpHeaders.SET_COOKIE, clearing.clearCookie().toString());
		}
		return response.body(problem);
	}

}
