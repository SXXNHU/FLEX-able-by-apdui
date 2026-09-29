package com.flexable.common.schema;

import com.flexable.common.error.ServiceUnavailableException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/** 스키마 준비 전에 API가 호출되면 "테이블 없음"(500) 대신 503으로 응답한다. */
@Component
public class SchemaReadyInterceptor implements HandlerInterceptor {

	private final SchemaMigrator migrator;

	SchemaReadyInterceptor(SchemaMigrator migrator) {
		this.migrator = migrator;
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (!migrator.isReady() && !CorsUtils.isPreFlightRequest(request)) {
			throw new ServiceUnavailableException("데이터베이스를 준비하고 있어요. 잠시 후 다시 시도해주세요.");
		}
		return true;
	}

}
