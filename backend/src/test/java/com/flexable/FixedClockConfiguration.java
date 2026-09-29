package com.flexable;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** 클라이언트 Vitest와 같은 날짜: 2026-09-29 15:00 KST */
@TestConfiguration(proxyBeanMethods = false)
public class FixedClockConfiguration {

	public static final Instant NOW = Instant.parse("2026-09-29T06:00:00Z");

	@Bean
	@Primary
	Clock fixedClock() {
		return Clock.fixed(NOW, ZoneId.of("Asia/Seoul"));
	}

}
