package com.flexable.ledger.domain;

/** 같은 카테고리에서 정산을 마친 계획들의 실제 사용액 범위 */
public record Estimate(long low, long high, long suggested, int count) {

}
