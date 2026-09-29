package com.flexable.common.config;

import java.time.Clock;
import java.time.ZoneId;

import com.flexable.common.schema.SchemaReadyInterceptor;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class WebConfig implements WebMvcConfigurer {

	/** 예산의 "오늘"은 사용자 기준 한국 날짜다. */
	public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

	private final AppProperties properties;

	private final SchemaReadyInterceptor schemaReadyInterceptor;

	WebConfig(AppProperties properties, SchemaReadyInterceptor schemaReadyInterceptor) {
		this.properties = properties;
		this.schemaReadyInterceptor = schemaReadyInterceptor;
	}

	@Bean
	Clock clock() {
		return Clock.system(ZONE);
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
			.allowedOrigins(properties.cors().allowedOrigins().toArray(String[]::new))
			.allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
			.allowedHeaders("*")
			.exposedHeaders("Retry-After")
			.maxAge(3600);
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(schemaReadyInterceptor).addPathPatterns("/api/**");
	}

}
