package com.flexable.ledger.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.ledger.application.PlanService.PlanRequest;
import com.flexable.ledger.domain.Budget;
import com.flexable.ledger.domain.FixedItem;
import com.flexable.ledger.domain.Ledger;
import com.flexable.ledger.domain.LedgerProfile;
import com.flexable.ledger.persistence.LedgerStore;
import com.flexable.ledger.persistence.ReconciledDateEntity;
import com.flexable.ledger.persistence.ReconciledDateRepository;
import com.flexable.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BudgetService {

	public record BudgetResponse(LocalDate today, LocalDate incomeDate, long days, long balance, long cardOutstanding,
			long protectedAmount, long fixedReserve, long plannedReserve, long generalToday, long rawRemaining,
			long daily, long todayRemaining, long todayPlanned, long shortage, long overToday, boolean provisional,
			List<LocalDate> pending, Instant lastReconciledAt) {

		static BudgetResponse of(LocalDate today, LedgerProfile p, Budget b, Instant lastReconciledAt) {
			return new BudgetResponse(today, p.incomeDate(), b.days(), p.balance(), p.cardOutstanding(),
					p.protectedAmount(), b.fixedReserve(), b.plannedReserve(), b.generalToday(), b.rawRemaining(),
					b.daily(), b.todayRemaining(), b.todayPlanned(), b.shortage(), b.overToday(), b.provisional(),
					b.pending(), lastReconciledAt);
		}

	}

	/** 계획 확정 전후 비교 ("하루 생활비 X원 → Y원") */
	public record PreviewResponse(BudgetResponse current, BudgetResponse preview) {
	}

	public record ReconciliationResponse(List<LocalDate> reconciledDates, Instant lastReconciledAt) {
	}

	private final LedgerStore store;

	private final ReconciledDateRepository reconciled;

	private final CurrentUser currentUser;

	private final Clock clock;

	BudgetService(LedgerStore store, ReconciledDateRepository reconciled, CurrentUser currentUser, Clock clock) {
		this.store = store;
		this.reconciled = reconciled;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public BudgetResponse today() {
		LedgerStore.Loaded loaded = store.load(currentUser.id());
		LocalDate today = LocalDate.now(clock);
		return BudgetResponse.of(today, loaded.ledger().profile(), loaded.ledger().budget(today),
				loaded.profile().getLastReconciledAt());
	}

	/** 저장하지 않고 계획을 확정했을 때의 예산을 계산한다. {@code id}를 주면 기존 계획을 바꾼 결과다. */
	@Transactional(readOnly = true)
	public PreviewResponse preview(String planId, PlanRequest request) {
		LedgerStore.Loaded loaded = store.load(currentUser.id());
		LocalDate today = LocalDate.now(clock);
		Ledger ledger = loaded.ledger();
		String id = planId != null ? planId : UUID.randomUUID().toString();
		Budget after = ledger.previewPlan(request.toDomain(id).withConfirmed(true), today);
		Instant last = loaded.profile().getLastReconciledAt();
		return new PreviewResponse(BudgetResponse.of(today, ledger.profile(), ledger.budget(today), last),
				BudgetResponse.of(today, ledger.profile(), after, last));
	}

	/** 예산 설정 화면에서 입력 중인 값으로 계산한 결과 (저장하지 않음). */
	public record SimulateRequest(@Min(-1_000_000_000_000L) @Max(1_000_000_000_000L) long balance,
			@NotNull LocalDate incomeDate, @Min(0) @Max(1_000_000_000_000L) long protectedAmount,
			@Min(-1_000_000_000_000L) @Max(1_000_000_000_000L) long cardOutstanding,
			@Size(max = 100) List<@Valid SimulatedFixed> fixed) {
	}

	/** @param id 기존 고정지출이면 그 ID (연결된 납부액을 반영하기 위해) */
	public record SimulatedFixed(String id, @Min(0) @Max(1_000_000_000_000L) long amount, @NotNull LocalDate date) {
	}

	@Transactional(readOnly = true)
	public BudgetResponse simulate(SimulateRequest request) {
		LocalDate today = LocalDate.now(clock);
		Optional<LedgerStore.Loaded> loaded = store.find(currentUser.id());
		Ledger current = loaded.map(LedgerStore.Loaded::ledger).orElse(null);
		LedgerProfile profile = new LedgerProfile(request.balance(), request.cardOutstanding(),
				request.protectedAmount(), request.incomeDate(),
				current != null ? current.profile().trackingStart() : today.minusDays(1));
		List<FixedItem> fixed = (request.fixed() != null ? request.fixed() : List.<SimulatedFixed>of()).stream()
			.map((f) -> new FixedItem(f.id() != null ? f.id() : UUID.randomUUID().toString(), "", f.amount(), f.date()))
			.toList();
		Ledger ledger = new Ledger(profile, fixed, current != null ? current.plans() : List.of(),
				current != null ? current.transactions() : List.of(),
				current != null ? current.reconciledDates() : Set.of());
		return BudgetResponse.of(today, profile, ledger.budget(today),
				loaded.map((l) -> l.profile().getLastReconciledAt()).orElse(null));
	}

	@Transactional(readOnly = true)
	public ReconciliationResponse reconciliations() {
		LedgerStore.Loaded loaded = store.load(currentUser.id());
		return new ReconciliationResponse(loaded.ledger().reconciledDates().stream().sorted().toList(),
				loaded.profile().getLastReconciledAt());
	}

	/** 사용자가 그날 빠진 거래가 없다고 확인했다. 무지출도 사용자가 직접 확인해야 한다. */
	@Transactional
	public ReconciliationResponse reconcile(LocalDate day) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		if (day.isAfter(LocalDate.now(clock))) {
			throw new BusinessRuleException("reconcile_future", "오늘 이후 날짜는 정산할 수 없어요.");
		}
		if (!loaded.ledger().reconciledDates().contains(day)) {
			reconciled.save(new ReconciledDateEntity(userId, day));
		}
		loaded.profile().markReconciled(clock.instant());
		List<LocalDate> days = Stream.concat(loaded.ledger().reconciledDates().stream(), Stream.of(day))
			.distinct()
			.sorted()
			.toList();
		return new ReconciliationResponse(days, loaded.profile().getLastReconciledAt());
	}

}
