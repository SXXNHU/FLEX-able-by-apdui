package com.flexable.ledger.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanRepository extends JpaRepository<PlanEntity, String> {

	/** 금액 제안은 "최근 8개"를 쓰므로 생성 순서가 의미 있다. */
	List<PlanEntity> findByUserIdOrderByCreatedAtAscIdAsc(String userId);

	Optional<PlanEntity> findByIdAndUserId(String id, String userId);

}
