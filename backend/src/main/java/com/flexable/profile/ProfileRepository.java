package com.flexable.profile;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface ProfileRepository extends JpaRepository<Profile, String> {

	/**
	 * 잔액을 바꾸는 작업은 사용자 단위로 줄을 세운다. 같은 사용자의 동시 요청(여러 기기, 재전송)이 서로의 잔액 변경을
	 * 덮어쓰지 않게 한다.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Profile p where p.userId = :userId")
	Optional<Profile> findForUpdate(String userId);

}
