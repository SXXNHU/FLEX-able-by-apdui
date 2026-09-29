package com.flexable.common.config;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(Cors cors, Schema schema, UUID devUserId) {

	public record Cors(List<String> allowedOrigins) {
	}

	public record Schema(Duration retryInitialDelay, Duration retryMaxDelay) {
	}

}
