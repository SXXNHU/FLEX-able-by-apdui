package com.flexable.ledger.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.common.error.ConflictException;
import com.flexable.common.error.NotFoundException;
import com.flexable.ledger.domain.FixedItem;
import com.flexable.ledger.domain.Ledger;
import com.flexable.ledger.persistence.FixedExpenseEntity;
import com.flexable.ledger.persistence.FixedExpenseRepository;
import com.flexable.ledger.persistence.LedgerStore;
import com.flexable.ledger.persistence.PlanRepository;
import com.flexable.ledger.persistence.TransactionRepository;
import com.flexable.user.CurrentUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FixedExpenseService {

	public record FixedExpenseRequest(@NotBlank(message = "고정지출 이름을 입력해주세요.") @Size(max = 40) String title,
			@Min(value = 1, message = "금액을 입력해주세요.") @Max(1_000_000_000_000L) long amount,
			@NotNull(message = "납부일을 입력해주세요.") LocalDate date) {
	}

	/** @param nextPeriod 다음 수입일 이후 납부라 현재 구간에서 확보하지 않음 */
	public record FixedExpenseResponse(String id, String title, long amount, LocalDate date, long actual,
			long remaining, boolean closed, boolean nextPeriod) {

		static FixedExpenseResponse of(Ledger ledger, FixedItem f) {
			return new FixedExpenseResponse(f.id(), f.title(), f.amount(), f.date(), ledger.actualFor(f.id()),
					ledger.remainingFor(f), ledger.isClosed(f.id()),
					!f.date().isBefore(ledger.profile().incomeDate()));
		}

	}

	private final LedgerStore store;

	private final FixedExpenseRepository fixed;

	private final PlanRepository plans;

	private final TransactionRepository transactions;

	private final CurrentUser currentUser;

	private final Clock clock;

	FixedExpenseService(LedgerStore store, FixedExpenseRepository fixed, PlanRepository plans,
			TransactionRepository transactions, CurrentUser currentUser, Clock clock) {
		this.store = store;
		this.fixed = fixed;
		this.plans = plans;
		this.transactions = transactions;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<FixedExpenseResponse> list() {
		Ledger ledger = store.load(currentUser.id()).ledger();
		return ledger.fixed().stream().map((f) -> FixedExpenseResponse.of(ledger, f)).toList();
	}

	@Transactional
	public FixedExpenseResponse save(String id, FixedExpenseRequest request) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		Optional<FixedExpenseEntity> existing = fixed.findById(id);
		if (existing.isPresent() && !existing.get().getUserId().equals(userId) || plans.existsById(id)) {
			throw new ConflictException("사용할 수 없는 고정지출 ID예요.");
		}
		FixedExpenseEntity entity = existing.orElseGet(() -> new FixedExpenseEntity(id, userId, clock.instant()));
		entity.update(request.title().strip(), request.amount(), request.date());
		fixed.save(entity);
		return FixedExpenseResponse.of(loaded.ledger(), entity.toDomain());
	}

	@Transactional
	public void delete(String id) {
		String userId = currentUser.id();
		store.loadForUpdate(userId);
		FixedExpenseEntity entity = fixed.findByIdAndUserId(id, userId)
			.orElseThrow(() -> new NotFoundException("고정지출을 찾을 수 없어요."));
		if (transactions.existsByUserIdAndFixedId(userId, id)) {
			throw new BusinessRuleException("fixed_has_transactions",
					"연결된 거래가 있어 삭제할 수 없어요. 새 구간에는 새 항목을 추가해주세요.");
		}
		fixed.delete(entity);
	}

}
