package com.flexable.ledger.domain;

import java.util.List;

/**
 * 오늘 기준 예산 계산 결과.
 *
 * @param days 오늘부터 다음 수입일 전날까지 남은 날짜 수
 * @param fixedReserve 미납 고정지출의 남은 확보액
 * @param plannedReserve 이번 구간 확정 계획의 남은 확보액
 * @param generalToday 오늘 일반 소비 순액 (계획 · 고정지출 연결 거래 제외, 환불 차감)
 * @param rawRemaining 현재 남은 일반 생활비 (음수 가능)
 * @param daily 오늘 시작 기준액
 * @param todayRemaining 오늘 더 쓸 수 있는 금액
 * @param todayPlanned 오늘 날짜 확정 계획의 남은 확보액 (일반 생활비와 별도)
 * @param shortage 구간 전체 부족액
 * @param overToday 오늘 기준액 초과액
 * @param pending 아직 확인하지 않은 날짜
 */
public record Budget(long days, List<PlanItem> activePlans, long fixedReserve, long plannedReserve,
		long generalToday, long rawRemaining, long daily, long todayRemaining, long todayPlanned, long shortage,
		long overToday, List<java.time.LocalDate> pending) {

	/** 미확인 날짜가 남아 있으면 잠정 금액이다. */
	public boolean provisional() {
		return !pending.isEmpty();
	}

}
