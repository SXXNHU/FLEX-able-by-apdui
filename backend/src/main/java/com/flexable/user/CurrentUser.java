package com.flexable.user;

/**
 * 요청한 사용자의 ID. 서비스 코드는 인증 방식과 무관하게 이 인터페이스만 의존한다.
 */
public interface CurrentUser {

	/** 인증된 사용자 ID. 인증되지 않은 요청이면 401 오류가 난다. */
	String id();

	/** 쓰기 전에 호출한다. 토큰의 사용자가 실제로 있는지 확인한다 (탈퇴 후 남은 토큰 방지). */
	String requireId();

}
