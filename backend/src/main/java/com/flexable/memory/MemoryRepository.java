package com.flexable.memory;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MemoryRepository extends JpaRepository<MemoryEntity, String> {

	List<MemoryEntity> findByUserIdOrderByCreatedAtAscIdAsc(String userId);

	Optional<MemoryEntity> findByIdAndUserId(String id, String userId);

	@Modifying
	@Query("delete from MemoryEntity m where m.userId = :userId")
	void deleteAllByUserId(String userId);

}
