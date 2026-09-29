package com.flexable.ledger.domain;

import java.time.LocalDate;

/**
 * 거래 한 건. {@code planId}와 {@code fixedId}는 둘 중 하나만, {@code refundOf}는 환불일 때만 쓴다.
 * {@code closesItem}은 이 지출로 연결된 계획 · 고정지출의 정산을 끝낸다는 뜻이다.
 */
public record LedgerTransaction(String id, String title, long amount, LocalDate date, Category category,
		TransactionKind kind, PaymentMethod method, String planId, String fixedId, String refundOf,
		boolean closesItem, TransactionSource source, String sourceEventId) {

	public boolean linkedTo(String itemId) {
		return itemId.equals(planId) || itemId.equals(fixedId);
	}

	public boolean isGeneral() {
		return planId == null && fixedId == null;
	}

	/** 소비 순액에 미치는 영향: 지출 +, 환불 -, 그 외 0 */
	public long spending() {
		return switch (kind) {
			case EXPENSE -> amount;
			case REFUND -> -amount;
			default -> 0;
		};
	}

}
