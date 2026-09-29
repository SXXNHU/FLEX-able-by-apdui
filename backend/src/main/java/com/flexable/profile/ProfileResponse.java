package com.flexable.profile;

import java.time.LocalDate;

import com.flexable.profile.Profile.ProtectionCycle;

public record ProfileResponse(String name, long balance, LocalDate incomeDate, long incomeAmount,
		long protectedAmount, ProtectionCycle protectionCycle, long cardOutstanding, LocalDate trackingStart,
		long version) {

	static ProfileResponse of(Profile p) {
		return new ProfileResponse(p.getName(), p.getBalance(), p.getIncomeDate(), p.getIncomeAmount(),
				p.getProtectedAmount(), p.getProtectionCycle(), p.getCardOutstanding(), p.getTrackingStart(),
				p.getVersion());
	}

}
