package com.flexable.user;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

	@Id
	@Column(length = 36)
	private String id;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected User() {
	}

	public User(String id, Instant createdAt) {
		this.id = id;
		this.createdAt = createdAt;
	}

	public String getId() {
		return id;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
