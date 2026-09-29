package com.flexable.ledger.domain;

import java.time.LocalDate;

/** 계산에 필요한 프로필 값. 잔액과 미결제 카드액은 거래가 반영될 때마다 바뀐다. */
public record LedgerProfile(long balance, long cardOutstanding, long protectedAmount, LocalDate incomeDate,
		LocalDate trackingStart) {

	LedgerProfile withMoney(long balance, long cardOutstanding) {
		return new LedgerProfile(balance, cardOutstanding, protectedAmount, incomeDate, trackingStart);
	}

}
