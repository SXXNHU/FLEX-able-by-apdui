package com.flexable.common.error;

import java.util.Map;

/** 요청 형식은 맞지만 예산 규칙에 어긋나는 경우 (예: 환불액이 원거래보다 큼). */
public class BusinessRuleException extends RuntimeException {

	private final String code;

	private final Map<String, Object> details;

	public BusinessRuleException(String code, String message) {
		this(code, message, Map.of());
	}

	/** {@code details}는 응답 ProblemDetail에 그대로 실린다 (예: 확인이 필요한 항목 ID). */
	public BusinessRuleException(String code, String message, Map<String, Object> details) {
		super(message);
		this.code = code;
		this.details = Map.copyOf(details);
	}

	public String code() {
		return code;
	}

	public Map<String, Object> details() {
		return details;
	}

}
