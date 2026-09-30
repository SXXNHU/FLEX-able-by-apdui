package com.flexable.ledger.application;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;

import com.flexable.importing.persistence.PendingImportRepository;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.PlanItem;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import com.flexable.ledger.persistence.FixedExpenseEntity;
import com.flexable.ledger.persistence.FixedExpenseRepository;
import com.flexable.ledger.persistence.PlanEntity;
import com.flexable.ledger.persistence.PlanRepository;
import com.flexable.ledger.persistence.ReconciledDateRepository;
import com.flexable.ledger.persistence.TransactionEntity;
import com.flexable.ledger.persistence.TransactionRepository;
import com.flexable.memory.MemoryEntity;
import com.flexable.memory.MemoryRepository;
import com.flexable.profile.Profile;
import com.flexable.profile.ProfileRepository;
import com.flexable.profile.ProfileRequest;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 사용자 데이터 전체를 다루는 작업: 시연 데이터 채우기, 모든 기록 초기화 */
@Service
public class LedgerDataService {

	private final ProfileRepository profiles;

	private final FixedExpenseRepository fixed;

	private final PlanRepository plans;

	private final TransactionRepository transactions;

	private final ReconciledDateRepository reconciled;

	private final MemoryRepository memories;

	private final Clock clock;

	private final PendingImportRepository pendingImports;

	LedgerDataService(ProfileRepository profiles, FixedExpenseRepository fixed, PlanRepository plans,
			TransactionRepository transactions, ReconciledDateRepository reconciled, MemoryRepository memories,
			Clock clock, PendingImportRepository pendingImports) {
		this.pendingImports = pendingImports;
		this.profiles = profiles;
		this.fixed = fixed;
		this.plans = plans;
		this.transactions = transactions;
		this.reconciled = reconciled;
		this.memories = memories;
		this.clock = clock;
	}

	/**
	 * 클라이언트의 기존 {@code demoState()}와 같은 시연 데이터. 어제 거래 3건은 현재 잔액에 이미 반영된 상태로 기록한다.
	 * 하루 생활비는 (142만 − 고정 65만 − 카드 22만 − 보호 25만 − 계획 8만) / 10일 = 22,000원이다.
	 */
	@Transactional
	public void seedDemo(String userId) {
		LocalDate today = LocalDate.now(clock);
		Instant now = clock.instant();
		Profile profile = new Profile(userId, today.minusDays(1));
		profile.update(new ProfileRequest("플렉서", 1_420_000, today.plusDays(10), 2_800_000, 250_000,
				Profile.ProtectionCycle.THIS_PERIOD, 220_000), now);
		profiles.save(profile);

		saveFixed(userId, "월세", 550_000, today.plusDays(3), now);
		saveFixed(userId, "통신 · 구독", 100_000, today.plusDays(6), now);

		LocalDate saturday = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
		savePlan(userId, new PlanItem(id(), "토요일, 저녁과 영화", 80_000, saturday, Category.SOCIAL, true),
				"둘이 데이트 · 내 부담 금액 80,000원", now);
		savePlan(userId, new PlanItem(id(), "새 모니터 장만하기", 300_000, today.plusDays(20), Category.SHOPPING, false),
				"다음 수입 이후 구매를 검토 중이에요.", now.plusMillis(1));

		LocalDate yesterday = today.minusDays(1);
		saveHistorical(userId, "점심 한 그릇", 9_500, yesterday, Category.FOOD, now);
		saveHistorical(userId, "동네 커피", 4_500, yesterday, Category.CAFE, now.plusMillis(1));
		saveHistorical(userId, "퇴근길 버스", 1_500, yesterday, Category.TRANSPORT, now.plusMillis(2));

		saveMemory(userId, "데이트 예산 기준", "식사와 영화 비용 중 내가 부담할 금액만 계획에 넣기.", now);
		saveMemory(userId, "지키고 싶은 돈", "비상금 25만 원은 생활비로 사용하지 않기.", now.plusMillis(1));
	}

	/** 예산 설정과 모든 기록을 지운다. 계정은 남긴다. */
	@Transactional
	public void reset(String userId) {
		profiles.findForUpdate(userId);
		transactions.deleteRefundsByUserId(userId);
		transactions.deleteAllByUserId(userId);
		reconciled.deleteAllByUserId(userId);
		plans.deleteAllByUserId(userId);
		fixed.deleteAllByUserId(userId);
		memories.deleteAllByUserId(userId);
		pendingImports.deleteAllByUserId(userId);
		profiles.deleteById(userId);
	}

	private void saveFixed(String userId, String title, long amount, LocalDate date, Instant now) {
		FixedExpenseEntity entity = new FixedExpenseEntity(id(), userId, now);
		entity.update(title, amount, date);
		fixed.save(entity);
	}

	private void savePlan(String userId, PlanItem plan, String note, Instant createdAt) {
		PlanEntity entity = new PlanEntity(plan.id(), userId, createdAt);
		entity.update(plan, note, createdAt);
		plans.save(entity);
	}

	private void saveHistorical(String userId, String title, long amount, LocalDate date, Category category,
			Instant createdAt) {
		transactions.save(TransactionEntity.of(userId, new LedgerTransaction(id(), title, amount, date, category,
				TransactionKind.EXPENSE, PaymentMethod.CASH, null, null, null, false, TransactionSource.DEMO, null),
				createdAt));
	}

	private void saveMemory(String userId, String title, String text, Instant now) {
		MemoryEntity memory = new MemoryEntity(id(), userId, now);
		memory.update(title, text, now);
		memories.save(memory);
	}

	private static String id() {
		return UUID.randomUUID().toString();
	}

}
