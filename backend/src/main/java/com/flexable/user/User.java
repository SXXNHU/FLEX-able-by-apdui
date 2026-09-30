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

	@Column(length = 254, unique = true)
	private String email;

	@Column(name = "password_hash", length = 100)
	private String passwordHash;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected User() {
	}

	public User(String id, String email, String passwordHash, Instant createdAt) {
		this.id = id;
		this.email = email;
		this.passwordHash = passwordHash;
		this.createdAt = createdAt;
	}

	public String getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
