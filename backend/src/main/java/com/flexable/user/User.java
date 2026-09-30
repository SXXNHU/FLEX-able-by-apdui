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

	/** 가입 없이 둘러보는 사용자 (자격 증명 없음) */
	@Column(nullable = false)
	private boolean guest;

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

	public static User guest(String id, Instant createdAt) {
		User user = new User(id, null, null, createdAt);
		user.guest = true;
		return user;
	}

	public boolean isGuest() {
		return guest;
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
