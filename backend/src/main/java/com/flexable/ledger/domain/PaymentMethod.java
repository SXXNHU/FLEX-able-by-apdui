package com.flexable.ledger.domain;

public enum PaymentMethod {

	/** 계좌 · 체크카드 · 현금: 잔액에서 바로 빠진다 */
	CASH,
	/** 신용카드: 미결제 카드액으로 확보한다 */
	CARD

}
