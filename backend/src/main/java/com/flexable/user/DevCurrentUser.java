package com.flexable.user;

import java.time.Clock;

import com.flexable.common.config.AppProperties;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 인증 도입 전 개발용: 모든 요청을 설정된 고정 사용자로 처리한다. */
@Component
class DevCurrentUser implements CurrentUser {

	private final String id;

	private final UserRepository users;

	private final Clock clock;

	DevCurrentUser(AppProperties properties, UserRepository users, Clock clock) {
		this.id = properties.devUserId().toString();
		this.users = users;
		this.clock = clock;
	}

	@Override
	public String id() {
		return id;
	}

	@Override
	@Transactional
	public String requireId() {
		if (!users.existsById(id)) {
			users.save(new User(id, clock.instant()));
		}
		return id;
	}

}
