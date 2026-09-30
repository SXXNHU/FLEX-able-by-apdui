package com.flexable.auth;

import java.time.Clock;
import java.util.Locale;
import java.util.UUID;

import com.flexable.common.error.ConflictException;
import com.flexable.user.User;
import com.flexable.user.UserRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AuthService {

	/** 없는 이메일로 로그인해도 비밀번호 검사 시간을 비슷하게 맞춘다 (계정 존재 여부 노출 방지). */
	private final String dummyHash;

	private final UserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final TokenService tokens;

	private final LoginThrottle throttle;

	private final Clock clock;

	AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokens, LoginThrottle throttle,
			Clock clock) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.tokens = tokens;
		this.throttle = throttle;
		this.clock = clock;
		this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
	}

	@Transactional
	TokenService.Tokens signup(String email, String password) {
		String normalized = normalize(email);
		if (users.existsByEmail(normalized)) {
			throw new ConflictException("이미 가입된 이메일이에요.");
		}
		User user = new User(UUID.randomUUID().toString(), normalized, passwordEncoder.encode(password),
				clock.instant());
		try {
			users.saveAndFlush(user);
		}
		catch (DataIntegrityViolationException ex) {
			throw new ConflictException("이미 가입된 이메일이에요.");
		}
		return tokens.issue(user.getId());
	}

	@Transactional
	TokenService.Tokens login(String email, String password) {
		String normalized = normalize(email);
		throttle.checkAllowed(normalized);
		User user = users.findByEmail(normalized).orElse(null);
		String hash = user != null && user.getPasswordHash() != null ? user.getPasswordHash() : dummyHash;
		if (!passwordEncoder.matches(password, hash) || user == null) {
			throttle.recordFailure(normalized);
			throw AuthException.invalidCredentials();
		}
		throttle.recordSuccess(normalized);
		return tokens.issue(user.getId());
	}

	/** 재사용 감지로 토큰 묶음을 무효화한 뒤 실패를 알리므로, 인증 실패에서는 롤백하지 않는다. */
	@Transactional(noRollbackFor = AuthException.class)
	TokenService.Tokens refresh(String refreshToken) {
		if (refreshToken == null || refreshToken.isBlank()) {
			throw AuthException.invalidRefreshToken();
		}
		return tokens.rotate(refreshToken);
	}

	@Transactional
	void logout(String refreshToken) {
		if (refreshToken != null && !refreshToken.isBlank()) {
			tokens.revoke(refreshToken);
		}
	}

	@Transactional(readOnly = true)
	User me(String userId) {
		return users.findById(userId).orElseThrow(AuthException::unauthorized);
	}

	static String normalize(String email) {
		return email.strip().toLowerCase(Locale.ROOT);
	}

}
