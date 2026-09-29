package com.flexable.profile;

import java.time.Clock;
import java.time.LocalDate;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.common.error.NotFoundException;
import com.flexable.user.CurrentUser;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {

	private final ProfileRepository profiles;

	private final CurrentUser currentUser;

	private final Clock clock;

	ProfileService(ProfileRepository profiles, CurrentUser currentUser, Clock clock) {
		this.profiles = profiles;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public ProfileResponse get() {
		return profiles.findById(currentUser.id())
			.map(ProfileResponse::of)
			.orElseThrow(() -> new NotFoundException("아직 예산 설정 전이에요."));
	}

	/** 처음 저장하면 오늘 전날부터 하루 정산을 추적한다 (클라이언트 emptyState와 같은 규칙). */
	@Transactional
	public ProfileResponse save(ProfileRequest request) {
		LocalDate today = LocalDate.now(clock);
		if (!request.incomeDate().isAfter(today)) {
			throw new BusinessRuleException("income_date_not_future",
					"다음 수입일을 오늘 이후로 설정해주세요. 오늘 입금된 돈은 현재 잔액에 포함해주세요.");
		}
		String userId = currentUser.requireId();
		Profile profile = profiles.findById(userId).orElseGet(() -> new Profile(userId, today.minusDays(1)));
		profile.update(request, clock.instant());
		return ProfileResponse.of(profiles.saveAndFlush(profile));
	}

}
