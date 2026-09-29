package com.flexable.ledger.persistence;

import java.util.Set;
import java.util.TreeSet;

import com.flexable.common.error.NotFoundException;
import com.flexable.ledger.domain.Ledger;
import com.flexable.profile.Profile;
import com.flexable.profile.ProfileRepository;

import org.springframework.stereotype.Component;

/**
 * 사용자의 원장 전체를 불러온다. 개인 가계부 규모(수천 건)에서는 전체를 올려 규칙을 한 곳에서 계산하는 편이 정확하다.
 * 거래가 많아지면 정산이 끝난 과거 거래를 요약하는 방식으로 줄인다.
 */
@Component
public class LedgerStore {

	public record Loaded(Profile profile, Ledger ledger) {
	}

	private final ProfileRepository profiles;

	private final FixedExpenseRepository fixed;

	private final PlanRepository plans;

	private final TransactionRepository transactions;

	private final ReconciledDateRepository reconciled;

	LedgerStore(ProfileRepository profiles, FixedExpenseRepository fixed, PlanRepository plans,
			TransactionRepository transactions, ReconciledDateRepository reconciled) {
		this.profiles = profiles;
		this.fixed = fixed;
		this.plans = plans;
		this.transactions = transactions;
		this.reconciled = reconciled;
	}

	/** 읽기용 */
	public Loaded load(String userId) {
		return assemble(profiles.findById(userId).orElseThrow(LedgerStore::noProfile));
	}

	/** 쓰기용: 프로필 행을 잠가 같은 사용자의 변경을 직렬화한다. 트랜잭션 안에서 호출해야 한다. */
	public Loaded loadForUpdate(String userId) {
		return assemble(profiles.findForUpdate(userId).orElseThrow(LedgerStore::noProfile));
	}

	private Loaded assemble(Profile profile) {
		String userId = profile.getUserId();
		Set<java.time.LocalDate> days = new TreeSet<>(reconciled.findDays(userId));
		Ledger ledger = new Ledger(profile.toLedgerProfile(),
				fixed.findByUserIdOrderByDueDateAscIdAsc(userId).stream().map(FixedExpenseEntity::toDomain).toList(),
				plans.findByUserIdOrderByCreatedAtAscIdAsc(userId).stream().map(PlanEntity::toDomain).toList(),
				transactions.findByUserIdOrderByCreatedAtDescIdDesc(userId)
					.stream()
					.map(TransactionEntity::toDomain)
					.toList(),
				days);
		return new Loaded(profile, ledger);
	}

	private static NotFoundException noProfile() {
		return new NotFoundException("아직 예산 설정 전이에요. 먼저 잔액과 수입일을 알려주세요.");
	}

}
