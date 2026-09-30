package com.flexable.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import com.flexable.common.config.AppProperties;

import org.springframework.stereotype.Component;

/**
 * 이메일 단위 비밀번호 대입 방지. 연속 실패가 기준을 넘으면 잠시 로그인을 막는다.
 *
 * <p>
 * 인스턴스 메모리에 둔다. 백엔드를 여러 대로 늘리면 공유 저장소(예: Redis)로 옮겨야 한다.
 */
@Component
class LoginThrottle {

	private record Failures(int count, Instant lockedUntil) {
	}

	private final ConcurrentHashMap<String, Failures> failures = new ConcurrentHashMap<>();

	private final int maxFailures;

	private final Duration lockDuration;

	private final Clock clock;

	LoginThrottle(AppProperties properties, Clock clock) {
		this.maxFailures = properties.auth().loginThrottle().maxFailures();
		this.lockDuration = properties.auth().loginThrottle().lockDuration();
		this.clock = clock;
	}

	void checkAllowed(String email) {
		Failures f = failures.get(email);
		if (f != null && f.lockedUntil() != null && clock.instant().isBefore(f.lockedUntil())) {
			throw AuthException.tooManyAttempts();
		}
	}

	void recordFailure(String email) {
		failures.compute(email, (key, f) -> {
			int count = (f == null || f.lockedUntil() != null && !clock.instant().isBefore(f.lockedUntil())) ? 1
					: f.count() + 1;
			return new Failures(count, count >= maxFailures ? clock.instant().plus(lockDuration) : null);
		});
	}

	void recordSuccess(String email) {
		failures.remove(email);
	}

}
