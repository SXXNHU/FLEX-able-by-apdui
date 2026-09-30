package com.flexable.auth;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/** 인증 오류도 다른 API 오류와 같은 ProblemDetail 형식으로 응답한다. */
@Component
class ProblemAuthenticationHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException {
		response.setHeader("WWW-Authenticate", "Bearer");
		write(response, 401, "unauthorized", "로그인이 필요해요. 다시 로그인해주세요.");
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response,
			AccessDeniedException accessDeniedException) throws IOException {
		write(response, 403, "forbidden", "이 요청을 처리할 권한이 없어요.");
	}

	private static void write(HttpServletResponse response, int status, String code, String detail)
			throws IOException {
		response.setStatus(status);
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		response.getWriter()
			.write("{\"type\":\"https://flex-able.app/problems/%s\",\"title\":\"%s\",\"status\":%d,\"detail\":\"%s\",\"code\":\"%s\"}"
				.formatted(code, status == 401 ? "Unauthorized" : "Forbidden", status, detail, code));
	}

}
