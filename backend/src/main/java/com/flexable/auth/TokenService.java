package com.flexable.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import com.flexable.common.config.AppProperties;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/**
 * Access Token(짧은 JWT)과 Refresh Token(긴 무작위 값)을 발급한다. Refresh Token은 쓸 때마다 새 값으로 바꾸고,
 * 이미 바뀐 토큰이 다시 쓰이면 탈취로 보고 같은 로그인에서 나온 토큰을 모두 무효화한다.
 */
@Component
class TokenService {

	record Tokens(String accessToken, long expiresIn, String refreshToken, String userId) {
	}

	private static final SecureRandom RANDOM = new SecureRandom();

	private final JwtEncoder encoder;

	private final RefreshTokenRepository refreshTokens;

	private final AppProperties.Auth auth;

	private final Clock clock;

	TokenService(JwtEncoder encoder, RefreshTokenRepository refreshTokens, AppProperties properties, Clock clock) {
		this.encoder = encoder;
		this.refreshTokens = refreshTokens;
		this.auth = properties.auth();
		this.clock = clock;
	}

	/** 새 로그인: 새 토큰 묶음을 시작한다. 트랜잭션 안에서 호출한다. */
	Tokens issue(String userId) {
		return issue(userId, UUID.randomUUID().toString());
	}

	/** 트랜잭션 안에서 호출한다. */
	Tokens rotate(String refreshToken) {
		Instant now = clock.instant();
		RefreshTokenEntity current = refreshTokens.findForUpdate(hash(refreshToken))
			.orElseThrow(AuthException::invalidRefreshToken);
		if (current.isSpent()) {
			// 이미 교체된 토큰의 재사용: 원래 사용자와 공격자 중 누가 쓰는지 알 수 없으므로 둘 다 끊는다.
			refreshTokens.revokeFamily(current.getFamilyId(), now);
			throw AuthException.invalidRefreshToken();
		}
		if (current.isExpired(now)) {
			throw AuthException.invalidRefreshToken();
		}
		current.markUsed(now);
		return issue(current.getUserId(), current.getFamilyId());
	}

	/** 로그아웃: 이 토큰이 속한 로그인의 모든 토큰을 무효화한다. 모르는 토큰이면 조용히 끝낸다. */
	void revoke(String refreshToken) {
		refreshTokens.findForUpdate(hash(refreshToken))
			.ifPresent((t) -> refreshTokens.revokeFamily(t.getFamilyId(), clock.instant()));
	}

	private Tokens issue(String userId, String familyId) {
		Instant now = clock.instant();
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(auth.issuer())
			.subject(userId)
			.issuedAt(now)
			.expiresAt(now.plus(auth.accessTokenTtl()))
			.id(UUID.randomUUID().toString())
			.build();
		String access = encoder
			.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
			.getTokenValue();
		byte[] raw = new byte[32];
		RANDOM.nextBytes(raw);
		String refresh = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
		refreshTokens.save(new RefreshTokenEntity(UUID.randomUUID().toString(), userId, familyId, hash(refresh),
				now.plus(auth.refreshTokenTtl()), now));
		return new Tokens(access, auth.accessTokenTtl().toSeconds(), refresh, userId);
	}

	static String hash(String token) {
		try {
			return HexFormat.of()
				.formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
