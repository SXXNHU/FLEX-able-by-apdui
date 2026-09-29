package com.flexable.common.error;

/** 요청 형식은 맞지만 예산 규칙에 어긋나는 경우 (예: 환불액이 원거래보다 큼). */
public class BusinessRuleException extends RuntimeException {

	private final String code;

	public BusinessRuleException(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}

}
