package com.flexable.profile;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.ledger.domain.LedgerProfile;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** 예산 계산의 출발점: 현재 잔액, 다음 수입일, 보호액, 미결제 카드액. */
@Entity
@Table(name = "profiles")
public class Profile {

	public enum ProtectionCycle {

		/** 이번 수입 구간 */
		THIS_PERIOD,
		/** 매주 검토 (참고 메모, 자동 차감 없음) */
		WEEKLY,
		/** 매달 검토 (참고 메모, 자동 차감 없음) */
		MONTHLY

	}

	@Id
	@Column(name = "user_id", length = 36)
	private String userId;

	@Column(nullable = false, length = 20)
	private String name;

	@Column(nullable = false)
	private long balance;

	@Column(name = "income_date", nullable = false)
	private LocalDate incomeDate;

	@Column(name = "income_amount", nullable = false)
	private long incomeAmount;

	@Column(name = "protected_amount", nullable = false)
	private long protectedAmount;

	@Enumerated(EnumType.STRING)
	@Column(name = "protection_cycle", nullable = false, length = 20)
	private ProtectionCycle protectionCycle;

	@Column(name = "card_outstanding", nullable = false)
	private long cardOutstanding;

	@Column(name = "tracking_start", nullable = false)
	private LocalDate trackingStart;

	@Column(name = "last_reconciled_at")
	private Instant lastReconciledAt;

	@Version
	private long version;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Profile() {
	}

	public Profile(String userId, LocalDate trackingStart) {
		this.userId = userId;
		this.trackingStart = trackingStart;
	}

	void update(ProfileRequest request, Instant now) {
		this.name = request.name().strip();
		this.balance = request.balance();
		this.incomeDate = request.incomeDate();
		this.incomeAmount = request.incomeAmount();
		this.protectedAmount = request.protectedAmount();
		this.protectionCycle = request.protectionCycle();
		this.cardOutstanding = request.cardOutstanding();
		this.updatedAt = now;
	}

	/** 거래 반영 결과로 바뀐 잔액과 미결제 카드액을 기록한다. */
	public void applyMoney(LedgerProfile money, Instant now) {
		if (money.balance() != balance || money.cardOutstanding() != cardOutstanding) {
			this.balance = money.balance();
			this.cardOutstanding = money.cardOutstanding();
			this.updatedAt = now;
		}
	}

	public void markReconciled(Instant now) {
		this.lastReconciledAt = now;
	}

	public LedgerProfile toLedgerProfile() {
		return new LedgerProfile(balance, cardOutstanding, protectedAmount, incomeDate, trackingStart);
	}

	public Instant getLastReconciledAt() {
		return lastReconciledAt;
	}

	public String getUserId() {
		return userId;
	}

	public String getName() {
		return name;
	}

	public long getBalance() {
		return balance;
	}

	public LocalDate getIncomeDate() {
		return incomeDate;
	}

	public long getIncomeAmount() {
		return incomeAmount;
	}

	public long getProtectedAmount() {
		return protectedAmount;
	}

	public ProtectionCycle getProtectionCycle() {
		return protectionCycle;
	}

	public long getCardOutstanding() {
		return cardOutstanding;
	}

	public LocalDate getTrackingStart() {
		return trackingStart;
	}

	public long getVersion() {
		return version;
	}

}
