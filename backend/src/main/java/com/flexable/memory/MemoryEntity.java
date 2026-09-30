package com.flexable.memory;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 계획할 때 참고하는 나만의 소비 기준 메모. 예산 계산에는 쓰지 않는다. */
@Entity
@Table(name = "memories")
public class MemoryEntity {

	@Id
	@Column(length = 36)
	private String id;

	@Column(name = "user_id", nullable = false, length = 36)
	private String userId;

	@Column(nullable = false, length = 40)
	private String title;

	@Column(nullable = false, length = 500)
	private String body;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected MemoryEntity() {
	}

	public MemoryEntity(String id, String userId, Instant createdAt) {
		this.id = id;
		this.userId = userId;
		this.createdAt = createdAt;
	}

	public void update(String title, String body, Instant now) {
		this.title = title;
		this.body = body;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getUserId() {
		return userId;
	}

	public String getTitle() {
		return title;
	}

	public String getBody() {
		return body;
	}

}
