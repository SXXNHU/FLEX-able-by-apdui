package com.flexable.auth;

import java.time.Instant;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, String> {

	/** 같은 토큰으로 동시에 갱신해도 한 요청만 새 토큰을 받는다. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select t from RefreshTokenEntity t where t.tokenHash = :tokenHash")
	Optional<RefreshTokenEntity> findForUpdate(String tokenHash);

	@Modifying
	@Query("update RefreshTokenEntity t set t.revokedAt = :now where t.familyId = :familyId and t.revokedAt is null")
	int revokeFamily(String familyId, Instant now);

}
