package com.flexable.ledger.domain;

import java.time.LocalDate;

/** 이번 구간의 미납 고정지출 한 건 (월세, 통신비 등). */
public record FixedItem(String id, String title, long amount, LocalDate date) implements ReservedItem {

}
