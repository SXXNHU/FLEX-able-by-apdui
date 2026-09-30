package com.flexable.importing.persistence;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.importing.domain.ImportedRow;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 자동 수집했지만 이미 있는 거래 같아서 사용자 확인을 기다리는 거래 */
@Entity
@Table(name = "pending_imports")
public class PendingImportEntity {

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

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private TransactionSource source;

	@Column(name = "source_event_id", nullable = false, length = 200)
	private String sourceEventId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "dismissed_at")
	private Instant dismissedAt;

	protected PendingImportEntity() {
	}

	public PendingImportEntity(String id, String userId, ImportedRow row, TransactionSource source, Instant now) {
		this.id = id;
		this.userId = userId;
		this.title = row.title();
		this.amount = row.amount();
		this.txDate = row.date();
		this.category = row.category();
		this.kind = row.kind();
		this.method = row.method();
		this.source = source;
		this.sourceEventId = row.sourceEventId();
		this.createdAt = now;
	}

	public void dismiss(Instant now) {
		this.dismissedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getTitle() {
		return title;
	}

	public long getAmount() {
		return amount;
	}

	public LocalDate getTxDate() {
		return txDate;
	}

	public Category getCategory() {
		return category;
	}

	public TransactionKind getKind() {
		return kind;
	}

	public PaymentMethod getMethod() {
		return method;
	}

	public TransactionSource getSource() {
		return source;
	}

	public String getSourceEventId() {
		return sourceEventId;
	}

}
