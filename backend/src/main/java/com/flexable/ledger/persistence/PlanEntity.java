package com.flexable.ledger.persistence;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.PlanItem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "plans")
public class PlanEntity {

	@Id
	@Column(length = 36)
	private String id;

	@Column(name = "user_id", nullable = false, length = 36)
	private String userId;

	@Column(nullable = false, length = 60)
	private String title;

	@Column(nullable = false)
	private long amount;

	@Column(name = "plan_date", nullable = false)
	private LocalDate planDate;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private Category category;

	@Column(nullable = false)
	private boolean confirmed;

	@Column(nullable = false, length = 500)
	private String note;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected PlanEntity() {
	}

	public PlanEntity(String id, String userId, Instant createdAt) {
		this.id = id;
		this.userId = userId;
		this.createdAt = createdAt;
	}

	public void update(PlanItem plan, String note, Instant now) {
		this.title = plan.title();
		this.amount = plan.amount();
		this.planDate = plan.date();
		this.category = plan.category();
		this.confirmed = plan.confirmed();
		this.note = note;
		this.updatedAt = now;
	}

	public PlanItem toDomain() {
		return new PlanItem(id, title, amount, planDate, category, confirmed);
	}

	public String getId() {
		return id;
	}

	public String getUserId() {
		return userId;
	}

	public String getNote() {
		return note;
	}

}
