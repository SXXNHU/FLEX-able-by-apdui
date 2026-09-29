package com.flexable.user;

/**
 * 요청한 사용자의 ID. 인증이 도입되면 Spring Security의 인증 정보에서 꺼내는 구현으로 교체한다. 서비스 코드는 이
 * 인터페이스만 의존하므로 교체 시 바뀌지 않는다.
 */
public interface CurrentUser {

	/** 조회용 사용자 ID. DB에 쓰지 않는다. */
	String id();

	/** 쓰기 전에 호출한다. 처음 보는 사용자라면 users 행을 만든다. */
	String requireId();

}
