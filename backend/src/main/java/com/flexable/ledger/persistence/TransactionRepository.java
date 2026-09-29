package com.flexable.ledger.persistence;

import java.util.List;
import java.util.Optional;

import com.flexable.ledger.domain.TransactionSource;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TransactionRepository extends JpaRepository<TransactionEntity, String> {

	List<TransactionEntity> findByUserIdOrderByCreatedAtDescIdDesc(String userId);

	Optional<TransactionEntity> findByIdAndUserId(String id, String userId);

	Optional<TransactionEntity> findByUserIdAndSourceAndSourceEventId(String userId, TransactionSource source,
			String sourceEventId);

	boolean existsByUserIdAndPlanId(String userId, String planId);

	boolean existsByUserIdAndFixedId(String userId, String fixedId);

}
