package com.flexable.ledger.domain;

public enum TransactionKind {

	/** 지출 */
	EXPENSE,
	/** 수입 (실제 입금) */
	INCOME,
	/** 환불: 원래 지출에 연결 */
	REFUND,
	/** 내 계좌 간 이체: 잔액 · 소비에 영향 없음 */
	TRANSFER,
	/** 카드대금 납부: 잔액과 미결제액을 함께 줄임 */
	CARD_PAYMENT

}
