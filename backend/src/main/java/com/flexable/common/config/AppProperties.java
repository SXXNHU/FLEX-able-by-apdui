package com.flexable.common.config;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(Cors cors, Schema schema, UUID devUserId, DevAuth devAuth) {

	public record Cors(List<String> allowedOrigins) {
	}

	public record Schema(Duration retryInitialDelay, Duration retryMaxDelay) {
	}

	/** 인증 도입 전 임시 설정 */
	public record DevAuth(boolean headerEnabled) {
	}

}
