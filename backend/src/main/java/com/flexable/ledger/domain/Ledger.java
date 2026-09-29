package com.flexable.ledger.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import com.flexable.common.error.BusinessRuleException;

/**
 * 한 사용자의 예산 원장. 기존 클라이언트 {@code src/domain.ts}의 규칙을 그대로 옮긴 불변 객체다.
 *
 * <p>
 * 거래를 반영하면 새 원장을 돌려준다. 저장은 호출한 서비스가 담당한다.
 *
 * @param transactions 최근 반영 순서 (새 거래가 앞)
 * @param plans 생성 순서
 */
public record Ledger(LedgerProfile profile, List<FixedItem> fixed, List<PlanItem> plans,
		List<LedgerTransaction> transactions, Set<LocalDate> reconciledDates) {

	public static final long MAX_AMOUNT = 1_000_000_000_000L;

	/** 추적 기간이 비정상적으로 길어도 계산량을 제한한다 (클라이언트와 같은 상한). */
	private static final int MAX_TRACKED_DAYS = 20_000;

	public Ledger {
		fixed = List.copyOf(fixed);
		plans = List.copyOf(plans);
		transactions = List.copyOf(transactions);
		reconciledDates = Set.copyOf(reconciledDates);
	}

	/* ─────────────── 계획 · 고정지출 확보액 ─────────────── */

	/** 연결된 지출 중 하나라도 정산 완료를 선택했으면 남은 확보액을 풀어준다. */
	public boolean isClosed(String itemId) {
		return transactions.stream()
			.anyMatch((t) -> t.linkedTo(itemId) && t.kind() == TransactionKind.EXPENSE && t.closesItem());
	}

	/** 연결된 실제 사용액 (환불 차감) */
	public long actualFor(String itemId) {
		return transactions.stream().filter((t) -> t.linkedTo(itemId)).mapToLong(LedgerTransaction::spending).sum();
	}

	public long remainingFor(ReservedItem item) {
		return isClosed(item.id()) ? 0 : Math.max(0, item.amount() - actualFor(item.id()));
	}

	/* ─────────────── 하루 정산 ─────────────── */

	/** 추적 시작일부터 어제까지, 그리고 과거 거래가 있는 날 중 확인하지 않은 날짜 */
	public List<LocalDate> pendingDates(LocalDate today) {
		LocalDate start = profile.trackingStart() != null ? profile.trackingStart() : today.minusDays(1);
		long count = Math.min(MAX_TRACKED_DAYS, Math.max(0, ChronoUnit.DAYS.between(start, today)));
		Set<LocalDate> dates = new TreeSet<>();
		for (long i = 0; i < count; i++) {
			dates.add(start.plusDays(i));
		}
		transactions.stream().map(LedgerTransaction::date).filter((d) -> d.isBefore(today)).forEach(dates::add);
		dates.removeAll(reconciledDates);
		return List.copyOf(dates);
	}

	/* ─────────────── 예산 계산 ─────────────── */

	/**
	 * 계산 구간은 오늘부터 다음 실제 수입일 전날까지다. 예정 수입은 더하지 않는다. 현재 잔액에는 오늘 소비가 이미
	 * 반영돼 있으므로 오늘 시작 기준액을 구할 때만 오늘 일반 소비를 되돌린다.
	 */
	public Budget budget(LocalDate today) {
		LocalDate incomeDate = profile.incomeDate();
		long days = ChronoUnit.DAYS.between(today, incomeDate);
		List<PlanItem> activePlans = plans.stream()
			.filter((p) -> p.confirmed() && p.date().isBefore(incomeDate) && !isClosed(p.id()))
			.toList();
		long fixedReserve = fixed.stream()
			.filter((f) -> f.date().isBefore(incomeDate))
			.mapToLong(this::remainingFor)
			.sum();
		long plannedReserve = activePlans.stream().mapToLong(this::remainingFor).sum();
		long generalToday = transactions.stream()
			.filter((t) -> t.date().equals(today) && t.isGeneral())
			.mapToLong(LedgerTransaction::spending)
			.sum();
		long rawRemaining = profile.balance() - fixedReserve - Math.max(0, profile.cardOutstanding())
				- profile.protectedAmount() - plannedReserve;
		long daily = days > 0 ? Math.max(0, Math.floorDiv(rawRemaining + generalToday, days)) : 0;
		long todayRemaining = days > 0 ? Math.max(0, daily - generalToday) : 0;
		long todayPlanned = activePlans.stream()
			.filter((p) -> p.date().equals(today))
			.mapToLong(this::remainingFor)
			.sum();
		return new Budget(days, activePlans, fixedReserve, plannedReserve, generalToday, rawRemaining, daily,
				todayRemaining, todayPlanned, Math.max(0, -rawRemaining), Math.max(0, generalToday - daily),
				pendingDates(today));
	}

	/** 계획을 확정했을 때의 예산 (저장하지 않음) */
	public Budget previewPlan(PlanItem plan, LocalDate today) {
		List<PlanItem> next = new ArrayList<>(plans.stream().filter((p) -> !p.id().equals(plan.id())).toList());
		next.add(plan);
		return new Ledger(profile, fixed, next, transactions, reconciledDates).budget(today);
	}

	/* ─────────────── 거래 반영 ─────────────── */

	public record Applied(Ledger ledger, LedgerTransaction transaction) {
	}

	/**
	 * 거래를 검증해 반영한다. 환불은 원거래의 결제 방법과 계획 · 고정지출 연결을 이어받는다. 거래가 추가된 날짜의
	 * 정산 확인은 무효가 된다.
	 */
	public Applied add(LedgerTransaction tx, LocalDate today) {
		if (tx.amount() <= 0 || tx.amount() > MAX_AMOUNT) {
			throw rule("invalid_amount", "금액은 1원 이상의 정수로 입력해주세요.");
		}
		if (tx.date() == null || tx.date().isAfter(today)) {
			throw rule("future_date", "거래 날짜는 오늘 또는 이전 날짜로 입력해주세요.");
		}
		if (tx.title() == null || tx.title().isBlank()) {
			throw rule("title_required", "거래 이름을 입력해주세요.");
		}
		if (transactions.stream().anyMatch((t) -> t.id().equals(tx.id()))) {
			throw rule("duplicate_id", "이미 반영된 거래예요.");
		}
		if (tx.planId() != null && tx.fixedId() != null) {
			throw rule("multiple_links", "계획과 고정지출 중 하나만 연결해주세요.");
		}
		boolean linked = tx.planId() != null || tx.fixedId() != null;
		if (linked && tx.kind() != TransactionKind.EXPENSE && tx.kind() != TransactionKind.REFUND) {
			throw rule("link_not_allowed", "소비 또는 환불만 계획과 연결할 수 있어요.");
		}
		if (tx.planId() != null && plans.stream().noneMatch((p) -> p.id().equals(tx.planId()) && p.confirmed())) {
			throw rule("plan_not_confirmed", "확정된 소비 계획을 선택해주세요.");
		}
		if (tx.fixedId() != null && fixed.stream().noneMatch((f) -> f.id().equals(tx.fixedId()))) {
			throw rule("fixed_not_found", "고정지출을 다시 선택해주세요.");
		}
		if (tx.kind() == TransactionKind.CARD_PAYMENT && tx.amount() > Math.max(0, profile.cardOutstanding())) {
			throw rule("card_payment_exceeds", "납부액이 현재 미결제 카드액보다 커요.");
		}
		LedgerTransaction normalized = tx.kind() == TransactionKind.REFUND ? inheritFromOriginal(tx)
				: new LedgerTransaction(tx.id(), tx.title().strip(), tx.amount(), tx.date(), tx.category(), tx.kind(),
						tx.method(), tx.planId(), tx.fixedId(), null,
						tx.closesItem() && tx.kind() == TransactionKind.EXPENSE && linked, tx.source(),
						tx.sourceEventId());
		Ledger next = new Ledger(applyMoney(normalized, 1), fixed, plans,
				Stream.concat(Stream.of(normalized), transactions.stream()).toList(),
				without(reconciledDates, normalized.date()));
		return new Applied(next, normalized);
	}

	private LedgerTransaction inheritFromOriginal(LedgerTransaction tx) {
		LedgerTransaction original = transactions.stream()
			.filter((t) -> t.id().equals(tx.refundOf()) && t.kind() == TransactionKind.EXPENSE)
			.findFirst()
			.orElseThrow(() -> rule("refund_original_required", "환불할 원래 결제내역을 선택해주세요."));
		long refunded = transactions.stream()
			.filter((t) -> original.id().equals(t.refundOf()))
			.mapToLong(LedgerTransaction::amount)
			.sum();
		if (tx.amount() + refunded > original.amount()) {
			throw rule("refund_exceeds_original", "남아 있는 원거래 금액보다 많이 환불할 수 없어요.");
		}
		return new LedgerTransaction(tx.id(), tx.title().strip(), tx.amount(), tx.date(), tx.category(),
				TransactionKind.REFUND, original.method(), original.planId(), original.fixedId(), original.id(), false,
				tx.source(), tx.sourceEventId());
	}

	/** 반영을 되돌리고 거래를 지운다. 연결된 환불이 있으면 먼저 지워야 한다. */
	public Ledger remove(String id) {
		LedgerTransaction tx = find(id).orElseThrow(() -> rule("transaction_not_found", "거래를 찾을 수 없어요."));
		if (transactions.stream().anyMatch((t) -> id.equals(t.refundOf()))) {
			throw rule("refund_exists", "연결된 환불을 먼저 삭제해주세요.");
		}
		return new Ledger(applyMoney(tx, -1), fixed, plans,
				transactions.stream().filter((t) -> !t.id().equals(id)).toList(),
				without(reconciledDates, tx.date()));
	}

	public Optional<LedgerTransaction> find(String id) {
		return transactions.stream().filter((t) -> t.id().equals(id)).findFirst();
	}

	/**
	 * 현금 지출은 잔액에서, 신용카드 지출은 미결제액으로 확보한다. 카드대금 납부는 잔액과 미결제액을 함께 줄여 이중
	 * 차감을 막는다. 이체는 영향이 없다.
	 */
	private LedgerProfile applyMoney(LedgerTransaction tx, int direction) {
		long balance = profile.balance();
		long card = profile.cardOutstanding();
		long amount = tx.amount() * direction;
		switch (tx.kind()) {
			case EXPENSE -> {
				if (tx.method() == PaymentMethod.CARD) {
					card += amount;
				}
				else {
					balance -= amount;
				}
			}
			case REFUND -> {
				if (tx.method() == PaymentMethod.CARD) {
					card -= amount;
				}
				else {
					balance += amount;
				}
			}
			case INCOME -> balance += amount;
			case CARD_PAYMENT -> {
				balance -= amount;
				card -= amount;
			}
			case TRANSFER -> {
			}
		}
		return profile.withMoney(balance, card);
	}

	/* ─────────────── 금액 제안 ─────────────── */

	/** 같은 카테고리에서 정산 완료된 최근 8개 계획의 실제 사용액 */
	public Optional<Estimate> estimate(Category category) {
		List<Long> amounts = plans.stream()
			.filter((p) -> p.category() == category && isClosed(p.id()))
			.map((p) -> actualFor(p.id()))
			.filter((a) -> a > 0)
			.toList();
		if (amounts.isEmpty()) {
			return Optional.empty();
		}
		List<Long> recent = amounts.subList(Math.max(0, amounts.size() - 8), amounts.size());
		long sum = recent.stream().mapToLong(Long::longValue).sum();
		return Optional.of(new Estimate(recent.stream().mapToLong(Long::longValue).min().orElseThrow(),
				recent.stream().mapToLong(Long::longValue).max().orElseThrow(),
				Math.round((double) sum / recent.size()), recent.size()));
	}

	private static Set<LocalDate> without(Set<LocalDate> dates, LocalDate date) {
		Set<LocalDate> copy = new TreeSet<>(dates);
		copy.remove(date);
		return copy;
	}

	private static BusinessRuleException rule(String code, String message) {
		return new BusinessRuleException(code, message);
	}

}
