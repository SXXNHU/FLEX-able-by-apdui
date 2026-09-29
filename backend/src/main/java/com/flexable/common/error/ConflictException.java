package com.flexable.common.error;

/** 같은 식별자로 다른 내용을 보냈거나 다른 사용자의 식별자와 겹친 경우 */
public class ConflictException extends RuntimeException {

	public ConflictException(String message) {
		super(message);
	}

}
