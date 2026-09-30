package com.flexable.auth;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import com.flexable.common.config.AppProperties;
import com.flexable.common.error.BusinessRuleException;
import com.flexable.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 인증 API. Refresh Token 전달 방식은 클라이언트 종류로 나눈다.
 * <ul>
 * <li>{@code WEB}: HttpOnly 쿠키로만 주고받는다. 스크립트가 읽을 수 없어 XSS로 장기 자격 증명이 새지 않는다.</li>
 * <li>{@code NATIVE}: 응답 본문으로 준다. 앱은 Android Keystore 기반 보안 저장소에 보관한다.</li>
 * </ul>
 * Access Token은 둘 다 본문으로 주며, 클라이언트는 메모리에만 둔다.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

	enum Client {

		WEB, NATIVE

	}

	/** 비밀번호 상한 72바이트는 BCrypt 제한 (한글은 글자당 3바이트) */
	record SignupRequest(@NotBlank @Email(message = "이메일 형식을 확인해주세요.") @Size(max = 254) String email,
			@NotBlank @Size(min = 8, max = 64, message = "비밀번호는 8자 이상이어야 해요.") String password, Client client) {
	}

	record LoginRequest(@NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 64) String password,
			Client client) {
	}

	/** @param refreshToken NATIVE만 본문으로 보낸다. WEB은 쿠키를 쓴다. */
	record RefreshRequest(@Size(max = 200) String refreshToken, Client client) {
	}

	/** @param refreshToken NATIVE에만 담긴다 */
	record TokenResponse(String accessToken, String tokenType, long expiresIn, String refreshToken, String userId) {
	}

	record MeResponse(String id, String email) {
	}

	private final AuthService auth;

	private final CurrentUser currentUser;

	private final AppProperties.Auth properties;

	AuthController(AuthService auth, CurrentUser currentUser, AppProperties properties) {
		this.auth = auth;
		this.currentUser = currentUser;
		this.properties = properties.auth();
	}

	@PostMapping("/signup")
	ResponseEntity<TokenResponse> signup(@Valid @RequestBody SignupRequest request) {
		if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
			throw new BusinessRuleException("password_too_long", "비밀번호가 너무 길어요.");
		}
		return respond(HttpStatus.CREATED, auth.signup(request.email(), request.password()), request.client());
	}

	@PostMapping("/login")
	ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
		return respond(HttpStatus.OK, auth.login(request.email(), request.password()), request.client());
	}

	/** 쿠키 기반 요청이지만 JSON 본문을 요구해 교차 사이트 폼 전송(CSRF)으로는 호출할 수 없다. */
	@PostMapping("/refresh")
	ResponseEntity<TokenResponse> refresh(@Valid @RequestBody RefreshRequest request,
			@CookieValue(name = "${app.auth.refresh-cookie.name}", required = false) String cookie) {
		Client client = clientOf(request.client());
		try {
			return respond(HttpStatus.OK,
					auth.refresh(client == Client.NATIVE ? request.refreshToken() : cookie), client);
		}
		catch (AuthException ex) {
			if (client == Client.WEB) {
				throw new CookieClearingAuthException(ex, clearCookie());
			}
			throw ex;
		}
	}

	@PostMapping("/logout")
	ResponseEntity<Void> logout(@RequestBody(required = false) RefreshRequest request,
			@CookieValue(name = "${app.auth.refresh-cookie.name}", required = false) String cookie) {
		String token = request != null && request.refreshToken() != null ? request.refreshToken() : cookie;
		auth.logout(token);
		return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, clearCookie().toString()).build();
	}

	@GetMapping("/me")
	MeResponse me() {
		var user = auth.me(currentUser.id());
		return new MeResponse(user.getId(), user.getEmail());
	}

	private ResponseEntity<TokenResponse> respond(HttpStatus status, TokenService.Tokens tokens, Client requested) {
		Client client = clientOf(requested);
		var builder = ResponseEntity.status(status);
		if (client == Client.WEB) {
			builder.header(HttpHeaders.SET_COOKIE, refreshCookie(tokens.refreshToken(), properties.refreshTokenTtl())
				.toString());
		}
		return builder.body(new TokenResponse(tokens.accessToken(), "Bearer", tokens.expiresIn(),
				client == Client.NATIVE ? tokens.refreshToken() : null, tokens.userId()));
	}

	private ResponseCookie refreshCookie(String value, Duration maxAge) {
		return ResponseCookie.from(properties.refreshCookie().name(), value)
			.httpOnly(true)
			.secure(properties.refreshCookie().secure())
			.sameSite(properties.refreshCookie().sameSite())
			.path("/api/auth")
			.maxAge(maxAge)
			.build();
	}

	private ResponseCookie clearCookie() {
		return refreshCookie("", Duration.ZERO);
	}

	private static Client clientOf(Client client) {
		return client != null ? client : Client.WEB;
	}

	/** 쿠키가 무효하면 브라우저에서도 지우도록 오류 응답에 만료 쿠키를 싣는다. */
	static class CookieClearingAuthException extends AuthException {

		private final ResponseCookie clear;

		CookieClearingAuthException(AuthException cause, ResponseCookie clear) {
			super(cause.status(), cause.code(), cause.getMessage());
			this.clear = clear;
		}

		ResponseCookie clearCookie() {
			return clear;
		}

	}

}
