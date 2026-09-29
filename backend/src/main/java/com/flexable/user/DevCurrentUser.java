package com.flexable.user;

import java.time.Clock;
import java.util.UUID;

import com.flexable.common.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 인증 도입 전 개발용: 모든 요청을 설정된 고정 사용자로 처리한다. {@code app.dev-auth.header-enabled}를 켜면
 * {@value #HEADER} 헤더로 사용자를 바꿀 수 있다 (테스트 격리용, 운영에서는 끈다).
 */
@Component
class DevCurrentUser implements CurrentUser {

	static final String HEADER = "X-Dev-User-Id";

	private final String defaultId;

	private final boolean headerEnabled;

	private final UserRepository users;

	private final Clock clock;

	DevCurrentUser(AppProperties properties, UserRepository users, Clock clock) {
		this.defaultId = properties.devUserId().toString();
		this.headerEnabled = properties.devAuth() != null && properties.devAuth().headerEnabled();
		this.users = users;
		this.clock = clock;
	}

	@Override
	public String id() {
		if (headerEnabled && RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
			HttpServletRequest request = attrs.getRequest();
			String header = request.getHeader(HEADER);
			if (header != null && !header.isBlank()) {
				return UUID.fromString(header.strip()).toString();
			}
		}
		return defaultId;
	}

	@Override
	@Transactional
	public String requireId() {
		String id = id();
		if (!users.existsById(id)) {
			users.save(new User(id, clock.instant()));
		}
		return id;
	}

}
