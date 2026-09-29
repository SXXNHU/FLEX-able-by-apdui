package com.flexable.ledger.application;

import java.time.LocalDate;

import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;

public record TransactionResponse(String id, String title, long amount, LocalDate date, Category category,
		TransactionKind kind, PaymentMethod method, String planId, String fixedId, String refundOf,
		boolean closesItem, TransactionSource source) {

	public static TransactionResponse of(LedgerTransaction t) {
		return new TransactionResponse(t.id(), t.title(), t.amount(), t.date(), t.category(), t.kind(), t.method(),
				t.planId(), t.fixedId(), t.refundOf(), t.closesItem(), t.source());
	}

}
