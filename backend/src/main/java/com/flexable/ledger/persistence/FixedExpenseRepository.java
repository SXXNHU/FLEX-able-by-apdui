package com.flexable.ledger.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface FixedExpenseRepository extends JpaRepository<FixedExpenseEntity, String> {

	List<FixedExpenseEntity> findByUserIdOrderByDueDateAscIdAsc(String userId);

	@Modifying
	@Query("delete from FixedExpenseEntity f where f.userId = :userId")
	void deleteAllByUserId(String userId);

	Optional<FixedExpenseEntity> findByIdAndUserId(String id, String userId);

}
