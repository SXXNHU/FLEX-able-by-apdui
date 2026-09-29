package com.flexable.ledger.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FixedExpenseRepository extends JpaRepository<FixedExpenseEntity, String> {

	List<FixedExpenseEntity> findByUserIdOrderByDueDateAscIdAsc(String userId);

	Optional<FixedExpenseEntity> findByIdAndUserId(String id, String userId);

}
