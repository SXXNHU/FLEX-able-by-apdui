package com.flexable.ledger.persistence;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.ledger.domain.FixedItem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "fixed_expenses")
public class FixedExpenseEntity {

	@Id
	@Column(length = 36)
	private String id;

	@Column(name = "user_id", nullable = false, length = 36)
	private String userId;

	@Column(nullable = false, length = 40)
	private String title;

	@Column(nullable = false)
	private long amount;

	@Column(name = "due_date", nullable = false)
	private LocalDate dueDate;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected FixedExpenseEntity() {
	}

	public FixedExpenseEntity(String id, String userId, Instant createdAt) {
		this.id = id;
		this.userId = userId;
		this.createdAt = createdAt;
	}

	public void update(String title, long amount, LocalDate dueDate) {
		this.title = title;
		this.amount = amount;
		this.dueDate = dueDate;
	}

	public FixedItem toDomain() {
		return new FixedItem(id, title, amount, dueDate);
	}

	public String getId() {
		return id;
	}

	public String getUserId() {
		return userId;
	}

}
