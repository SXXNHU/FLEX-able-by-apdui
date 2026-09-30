package com.flexable.ledger.persistence;

import java.util.List;
import java.util.Optional;

import com.flexable.ledger.domain.TransactionSource;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface TransactionRepository extends JpaRepository<TransactionEntity, String> {

	List<TransactionEntity> findByUserIdOrderByCreatedAtDescIdDesc(String userId);

	Optional<TransactionEntity> findByIdAndUserId(String id, String userId);

	Optional<TransactionEntity> findByUserIdAndSourceAndSourceEventId(String userId, TransactionSource source,
			String sourceEventId);

	/** 환불이 원거래를 참조하므로 환불부터 지운다. */
	@Modifying
	@Query("delete from TransactionEntity t where t.userId = :userId and t.refundOf is not null")
	void deleteRefundsByUserId(String userId);

	@Modifying
	@Query("delete from TransactionEntity t where t.userId = :userId")
	void deleteAllByUserId(String userId);

	boolean existsByUserIdAndPlanId(String userId, String planId);

	boolean existsByUserIdAndFixedId(String userId, String fixedId);

}
