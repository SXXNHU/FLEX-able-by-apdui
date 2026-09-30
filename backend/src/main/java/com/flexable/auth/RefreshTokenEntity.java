package com.flexable.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "refresh_tokens")
class RefreshTokenEntity {

	@Id
	@Column(length = 36)
	private String id;

	@Column(name = "user_id", nullable = false, length = 36)
	private String userId;

	@Column(name = "family_id", nullable = false, length = 36)
	private String familyId;

	@Column(name = "token_hash", nullable = false, length = 64, unique = true)
	private String tokenHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "used_at")
	private Instant usedAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	protected RefreshTokenEntity() {
	}

	RefreshTokenEntity(String id, String userId, String familyId, String tokenHash, Instant expiresAt,
			Instant createdAt) {
		this.id = id;
		this.userId = userId;
		this.familyId = familyId;
		this.tokenHash = tokenHash;
		this.expiresAt = expiresAt;
		this.createdAt = createdAt;
	}

	/** 이미 새 토큰으로 교체됐거나 무효화된 토큰 */
	boolean isSpent() {
		return usedAt != null || revokedAt != null;
	}

	boolean isExpired(Instant now) {
		return !expiresAt.isAfter(now);
	}

	void markUsed(Instant now) {
		this.usedAt = now;
	}

	String getUserId() {
		return userId;
	}

	String getFamilyId() {
		return familyId;
	}

}
