package com.flexable.ledger.application;

import java.time.LocalDate;
import java.util.UUID;

import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 거래 입력. {@code id}는 클라이언트가 만든 UUID로, 같은 요청을 다시 보내도 한 번만 반영되게 하는 멱등 키다. 비우면
 * 서버가 만든다.
 */
public record TransactionRequest(UUID id, @NotBlank(message = "거래 이름을 입력해주세요.") @Size(max = 60) String title,
		@Min(value = 1, message = "금액은 1원 이상이어야 해요.") @Max(1_000_000_000_000L) long amount,
		@NotNull(message = "거래일을 입력해주세요.") LocalDate date, @NotNull Category category,
		@NotNull TransactionKind kind, PaymentMethod method, UUID planId, UUID fixedId, UUID refundOf,
		boolean closesItem, TransactionSource source) {

	/** 알림 · 계좌 연동 거래는 가져오기 API로만 만든다. */
	@AssertTrue(message = "이 경로로 만들 수 없는 거래 출처예요.")
	public boolean isSourceAllowed() {
		return source == null || source == TransactionSource.MANUAL || source == TransactionSource.CAPTURE
				|| source == TransactionSource.CSV || source == TransactionSource.DEMO;
	}

}
