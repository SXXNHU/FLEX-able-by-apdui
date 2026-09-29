package com.flexable.ledger.domain;

import java.time.LocalDate;

/** 소비 계획. 확정된 계획만 현재 구간 예산에서 미리 확보한다. */
public record PlanItem(String id, String title, long amount, LocalDate date, Category category, boolean confirmed)
		implements ReservedItem {

	public PlanItem withConfirmed(boolean value) {
		return new PlanItem(id, title, amount, date, category, value);
	}

}
