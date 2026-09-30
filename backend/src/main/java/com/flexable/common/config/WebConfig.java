package com.flexable.common.config;

import java.time.Clock;
import java.time.ZoneId;

import com.flexable.common.schema.SchemaReadyInterceptor;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** CORS는 인증보다 먼저 처리돼야 하므로 {@code SecurityConfig}에 있다. */
@Configuration(proxyBeanMethods = false)
public class WebConfig implements WebMvcConfigurer {

	/** 예산의 "오늘"은 사용자 기준 한국 날짜다. */
	public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

	private final SchemaReadyInterceptor schemaReadyInterceptor;

	WebConfig(SchemaReadyInterceptor schemaReadyInterceptor) {
		this.schemaReadyInterceptor = schemaReadyInterceptor;
	}

	@Bean
	Clock clock() {
		return Clock.system(ZONE);
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(schemaReadyInterceptor).addPathPatterns("/api/**");
	}

}
