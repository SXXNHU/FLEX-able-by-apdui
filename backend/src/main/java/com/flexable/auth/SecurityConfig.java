package com.flexable.auth;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.flexable.common.config.AppProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 무상태 토큰 인증. 요청마다 Access Token(JWT, HS256)을 서명 · 만료만으로 검증하므로 DB가 잠시 내려가도 인증 자체는
 * 동작한다. 로그인 · 토큰 갱신만 DB를 쓴다.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

	private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

	@Bean
	SecurityFilterChain api(HttpSecurity http, ProblemAuthenticationHandlers problems) throws Exception {
		http.cors(Customizer.withDefaults())
			// 쿠키는 /api/auth/refresh · logout에만 쓰이고 SameSite와 JSON 본문 요구로 교차 사이트 요청을 막는다.
			.csrf((csrf) -> csrf.disable())
			.sessionManagement((s) -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests((auth) -> auth.requestMatchers(HttpMethod.OPTIONS, "/**")
				.permitAll()
				.requestMatchers("/actuator/health", "/actuator/health/**")
				.permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login", "/api/auth/refresh",
						"/api/auth/logout")
				.permitAll()
				.requestMatchers("/api/**")
				.authenticated()
				.anyRequest()
				.denyAll())
			.oauth2ResourceServer((rs) -> rs.jwt(Customizer.withDefaults())
				.authenticationEntryPoint(problems)
				.accessDeniedHandler(problems))
			.exceptionHandling((e) -> e.authenticationEntryPoint(problems).accessDeniedHandler(problems));
		return http.build();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(properties.cors().allowedOrigins());
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		config.setExposedHeaders(List.of("Retry-After"));
		// 웹의 refresh token 쿠키를 보내려면 필요하다. 허용 출처는 명시 목록으로만 둔다.
		config.setAllowCredentials(true);
		config.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", config);
		return source;
	}

	@Bean
	SecretKey jwtKey(AppProperties properties) {
		String secret = properties.auth().jwtSecret();
		byte[] bytes;
		if (secret == null || secret.isBlank()) {
			bytes = new byte[32];
			new SecureRandom().nextBytes(bytes);
			log.warn("AUTH_JWT_SECRET is not set. Using a temporary key; all tokens become invalid on restart.");
		}
		else {
			bytes = Base64.getDecoder().decode(secret.strip());
			if (bytes.length < 32) {
				throw new IllegalStateException("AUTH_JWT_SECRET must be at least 32 bytes (Base64 encoded)");
			}
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
	}

	/** 만료 검사도 애플리케이션 Clock을 쓴다 (발급과 검증의 시간 기준을 일치). */
	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey, AppProperties properties, Clock clock) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
		JwtTimestampValidator timestamps = new JwtTimestampValidator();
		timestamps.setClock(clock);
		decoder.setJwtValidator(
				new DelegatingOAuth2TokenValidator<>(timestamps, new JwtIssuerValidator(properties.auth().issuer())));
		return decoder;
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

}
