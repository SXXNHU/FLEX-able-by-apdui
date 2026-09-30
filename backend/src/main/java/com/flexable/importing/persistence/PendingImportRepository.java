package com.flexable.importing.persistence;

import java.util.List;
import java.util.Optional;

import com.flexable.ledger.domain.TransactionSource;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PendingImportRepository extends JpaRepository<PendingImportEntity, String> {

	@Query("select p from PendingImportEntity p where p.userId = :userId and p.dismissedAt is null order by p.createdAt, p.id")
	List<PendingImportEntity> findOpen(String userId);

	@Query("select p from PendingImportEntity p where p.id = :id and p.userId = :userId and p.dismissedAt is null")
	Optional<PendingImportEntity> findOpen(String id, String userId);

	boolean existsByUserIdAndSourceAndSourceEventId(String userId, TransactionSource source, String sourceEventId);

	@Modifying
	@Query("delete from PendingImportEntity p where p.userId = :userId")
	void deleteAllByUserId(String userId);

}
