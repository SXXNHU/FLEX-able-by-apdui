package com.flexable.profile;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.profile.Profile.ProtectionCycle;

public record ProfileResponse(String name, long balance, LocalDate incomeDate, long incomeAmount,
		long protectedAmount, ProtectionCycle protectionCycle, long cardOutstanding, LocalDate trackingStart,
		Instant lastReconciledAt, String notificationTime, boolean notificationsEnabled, long version) {

	static ProfileResponse of(Profile p) {
		return new ProfileResponse(p.getName(), p.getBalance(), p.getIncomeDate(), p.getIncomeAmount(),
				p.getProtectedAmount(), p.getProtectionCycle(), p.getCardOutstanding(), p.getTrackingStart(),
				p.getLastReconciledAt(), p.getNotificationTime(), p.isNotificationsEnabled(), p.getVersion());
	}

}
