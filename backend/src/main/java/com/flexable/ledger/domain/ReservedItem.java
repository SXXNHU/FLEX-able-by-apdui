package com.flexable.ledger.domain;

/** 미리 확보해 두는 돈: 고정지출 또는 확정 계획 */
public sealed interface ReservedItem permits FixedItem, PlanItem {

	String id();

	long amount();

}
