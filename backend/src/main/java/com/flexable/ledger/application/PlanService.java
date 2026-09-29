package com.flexable.ledger.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.common.error.ConflictException;
import com.flexable.common.error.NotFoundException;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.Estimate;
import com.flexable.ledger.domain.Ledger;
import com.flexable.ledger.domain.PlanItem;
import com.flexable.ledger.persistence.FixedExpenseRepository;
import com.flexable.ledger.persistence.LedgerStore;
import com.flexable.ledger.persistence.PlanEntity;
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
public class PlanService {

	public record PlanRequest(@NotBlank(message = "계획 이름을 입력해주세요.") @Size(max = 60) String title,
			@Min(0) @Max(1_000_000_000_000L) long amount, @NotNull(message = "예정일을 입력해주세요.") LocalDate date,
			@NotNull Category category, boolean confirmed, @Size(max = 500) String note) {

		PlanItem toDomain(String id) {
			return new PlanItem(id, title.strip(), amount, date, category, confirmed);
		}

	}

	/**
	 * @param actual 연결된 실제 사용액 (환불 차감)
	 * @param remaining 아직 확보 중인 금액
	 * @param closed 정산 완료 여부
	 */
	public record PlanResponse(String id, String title, long amount, LocalDate date, Category category,
			boolean confirmed, String note, long actual, long remaining, boolean closed) {
	}

	private final LedgerStore store;

	private final PlanRepository plans;

	private final FixedExpenseRepository fixed;

	private final TransactionRepository transactions;

	private final CurrentUser currentUser;

	private final Clock clock;

	PlanService(LedgerStore store, PlanRepository plans, FixedExpenseRepository fixed,
			TransactionRepository transactions, CurrentUser currentUser, Clock clock) {
		this.store = store;
		this.plans = plans;
		this.fixed = fixed;
		this.transactions = transactions;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<PlanResponse> list() {
		String userId = currentUser.id();
		Ledger ledger = store.load(userId).ledger();
		Map<String, PlanEntity> entities = plans.findByUserIdOrderByCreatedAtAscIdAsc(userId)
			.stream()
			.collect(Collectors.toMap(PlanEntity::getId, Function.identity()));
		return ledger.plans().stream().map((p) -> response(ledger, p, entities.get(p.id()).getNote())).toList();
	}

	/** 클라이언트가 만든 ID로 생성하거나 수정한다 (같은 요청 반복 시 결과 동일). */
	@Transactional
	public PlanResponse save(String id, PlanRequest request) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		if (request.date().isBefore(LocalDate.now(clock))) {
			throw new BusinessRuleException("plan_date_past", "계획 날짜는 오늘 이후로 정해주세요.");
		}
		if (request.confirmed() && request.amount() == 0) {
			throw new BusinessRuleException("plan_amount_required", "예산에 반영하려면 내가 부담할 금액을 입력해주세요.");
		}
		Optional<PlanEntity> existing = plans.findById(id);
		if (existing.isPresent() && !existing.get().getUserId().equals(userId) || fixed.existsById(id)) {
			throw new ConflictException("사용할 수 없는 계획 ID예요.");
		}
		PlanEntity entity = existing.orElseGet(() -> new PlanEntity(id, userId, clock.instant()));
		String note = request.note() != null ? request.note().strip() : "";
		entity.update(request.toDomain(id), note, clock.instant());
		plans.save(entity);
		return response(loaded.ledger(), entity.toDomain(), note);
	}

	/** 실제 거래가 연결된 계획은 거래를 먼저 정리해야 지울 수 있다. */
	@Transactional
	public void delete(String id) {
		String userId = currentUser.id();
		store.loadForUpdate(userId);
		PlanEntity entity = plans.findByIdAndUserId(id, userId)
			.orElseThrow(() -> new NotFoundException("계획을 찾을 수 없어요."));
		if (transactions.existsByUserIdAndPlanId(userId, id)) {
			throw new BusinessRuleException("plan_has_transactions", "연결된 거래가 있어요. 거래를 먼저 수정하거나 삭제해주세요.");
		}
		plans.delete(entity);
	}

	@Transactional(readOnly = true)
	public Optional<Estimate> estimate(Category category) {
		return store.load(currentUser.id()).ledger().estimate(category);
	}

	static PlanResponse response(Ledger ledger, PlanItem p, String note) {
		return new PlanResponse(p.id(), p.title(), p.amount(), p.date(), p.category(), p.confirmed(), note,
				ledger.actualFor(p.id()), ledger.remainingFor(p), ledger.isClosed(p.id()));
	}

}
