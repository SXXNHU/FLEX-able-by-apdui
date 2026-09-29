package com.flexable.profile;

import java.time.LocalDate;

import com.flexable.profile.Profile.ProtectionCycle;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 금액 범위는 기존 클라이언트 규칙(domain.ts validateState)과 같다: 최대 1조 원. */
public record ProfileRequest(@NotBlank(message = "이름을 입력해주세요.") @Size(max = 20) String name,
		@Min(value = -1_000_000_000_000L) @Max(1_000_000_000_000L) long balance,
		@NotNull(message = "다음 수입일을 입력해주세요.") LocalDate incomeDate,
		@Min(0) @Max(1_000_000_000_000L) long incomeAmount, @Min(0) @Max(1_000_000_000_000L) long protectedAmount,
		@NotNull ProtectionCycle protectionCycle,
		@Min(value = -1_000_000_000_000L) @Max(1_000_000_000_000L) long cardOutstanding) {

}
