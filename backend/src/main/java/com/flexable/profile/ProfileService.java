package com.flexable.profile;

import java.time.Clock;
import java.time.LocalDate;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.common.error.NotFoundException;
import com.flexable.user.CurrentUser;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

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

	public record SettingsRequest(@NotNull @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$",
			message = "알림 시간을 HH:mm 형식으로 입력해주세요.") String notificationTime, boolean notificationsEnabled) {
	}

	@Transactional
	public ProfileResponse saveSettings(SettingsRequest request) {
		Profile profile = profiles.findForUpdate(currentUser.id())
			.orElseThrow(() -> new NotFoundException("아직 예산 설정 전이에요."));
		profile.updateSettings(request.notificationTime(), request.notificationsEnabled(), clock.instant());
		return ProfileResponse.of(profiles.saveAndFlush(profile));
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
		// 거래 반영과 같은 잠금을 써서, 설정 수정이 동시에 반영된 거래의 잔액 변경을 덮어쓰지 않게 한다.
		Profile profile = profiles.findForUpdate(userId).orElseGet(() -> new Profile(userId, today.minusDays(1)));
		profile.update(request, clock.instant());
		return ProfileResponse.of(profiles.saveAndFlush(profile));
	}

}
