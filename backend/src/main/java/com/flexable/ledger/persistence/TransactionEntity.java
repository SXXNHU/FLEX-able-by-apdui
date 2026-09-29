package com.flexable.ledger.persistence;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 한 번 반영된 거래는 수정하지 않는다. 수정은 삭제 후 같은 ID로 다시 반영한다 (금액 되돌림 포함). */
@Entity
@Table(name = "transactions")
public class TransactionEntity {

	@Id
	@Column(length = 36)
	private String id;

	@Column(name = "user_id", nullable = false, length = 36)
	private String userId;

	@Column(nullable = false, length = 60)
	private String title;

	@Column(nullable = false)
	private long amount;

	@Column(name = "tx_date", nullable = false)
	private LocalDate txDate;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private Category category;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private TransactionKind kind;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private PaymentMethod method;

	@Column(name = "plan_id", length = 36)
	private String planId;

	@Column(name = "fixed_id", length = 36)
	private String fixedId;

	@Column(name = "refund_of", length = 36)
	private String refundOf;

	@Column(name = "closes_item", nullable = false)
	private boolean closesItem;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private TransactionSource source;

	@Column(name = "source_event_id", length = 200)
	private String sourceEventId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected TransactionEntity() {
	}

	public static TransactionEntity of(String userId, LedgerTransaction t, Instant createdAt) {
		TransactionEntity e = new TransactionEntity();
		e.id = t.id();
		e.userId = userId;
		e.title = t.title();
		e.amount = t.amount();
		e.txDate = t.date();
		e.category = t.category();
		e.kind = t.kind();
		e.method = t.method();
		e.planId = t.planId();
		e.fixedId = t.fixedId();
		e.refundOf = t.refundOf();
		e.closesItem = t.closesItem();
		e.source = t.source();
		e.sourceEventId = t.sourceEventId();
		e.createdAt = createdAt;
		return e;
	}

	public LedgerTransaction toDomain() {
		return new LedgerTransaction(id, title, amount, txDate, category, kind, method, planId, fixedId, refundOf,
				closesItem, source, sourceEventId);
	}

	public String getId() {
		return id;
	}

	public String getUserId() {
		return userId;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
