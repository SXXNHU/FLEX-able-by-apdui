package com.flexable.ledger.persistence;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ReconciledDateRepository extends JpaRepository<ReconciledDateEntity, ReconciledDateEntity.Key> {

	@Query("select r.key.day from ReconciledDateEntity r where r.key.userId = :userId order by r.key.day")
	List<LocalDate> findDays(String userId);

	@Modifying
	@Query("delete from ReconciledDateEntity r where r.key.userId = :userId")
	void deleteAllByUserId(String userId);

	@Modifying
	@Query("delete from ReconciledDateEntity r where r.key.userId = :userId and r.key.day = :day")
	void deleteDay(String userId, LocalDate day);

}
