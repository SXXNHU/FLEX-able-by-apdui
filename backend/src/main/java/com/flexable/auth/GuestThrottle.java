package com.flexable.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * 게스트 계정 대량 생성 방지: 같은 IP에서 1시간에 {@value #MAX_PER_WINDOW}개까지.
 *
 * <p>
 * 인스턴스 메모리에 둔다 (LoginThrottle과 같은 한계).
 */
@Component
class GuestThrottle {

	static final int MAX_PER_WINDOW = 20;

	private static final Duration WINDOW = Duration.ofHours(1);

	private record Window(Instant start, int count) {
	}

	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

	private final Clock clock;

	GuestThrottle(Clock clock) {
		this.clock = clock;
	}

	void acquire(String address) {
		Instant now = clock.instant();
		Window window = windows.compute(address, (key, w) -> w == null || !now.isBefore(w.start().plus(WINDOW))
				? new Window(now, 1) : new Window(w.start(), w.count() + 1));
		if (window.count() > MAX_PER_WINDOW) {
			throw AuthException.tooManyAttempts();
		}
	}

}
