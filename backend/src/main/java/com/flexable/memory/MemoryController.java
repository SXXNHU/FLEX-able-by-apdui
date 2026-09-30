package com.flexable.memory;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import com.flexable.common.error.ConflictException;
import com.flexable.common.error.NotFoundException;
import com.flexable.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 소비 기준 메모. 규칙이 없는 단순 저장이라 서비스 계층 없이 둔다. */
@RestController
@RequestMapping("/api/memories")
class MemoryController {

	record MemoryRequest(@NotBlank(message = "제목을 입력해주세요.") @Size(max = 40) String title,
			@NotBlank(message = "기억할 내용을 입력해주세요.") @Size(max = 500) String text) {
	}

	record MemoryResponse(String id, String title, String text) {

		static MemoryResponse of(MemoryEntity m) {
			return new MemoryResponse(m.getId(), m.getTitle(), m.getBody());
		}

	}

	private final MemoryRepository memories;

	private final CurrentUser currentUser;

	private final Clock clock;

	MemoryController(MemoryRepository memories, CurrentUser currentUser, Clock clock) {
		this.memories = memories;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@GetMapping
	@Transactional(readOnly = true)
	List<MemoryResponse> list() {
		return memories.findByUserIdOrderByCreatedAtAscIdAsc(currentUser.id())
			.stream()
			.map(MemoryResponse::of)
			.toList();
	}

	@PutMapping("/{id}")
	@Transactional
	MemoryResponse save(@PathVariable UUID id, @Valid @RequestBody MemoryRequest request) {
		String userId = currentUser.requireId();
		MemoryEntity memory = memories.findById(id.toString())
			.orElseGet(() -> new MemoryEntity(id.toString(), userId, clock.instant()));
		if (!memory.getUserId().equals(userId)) {
			throw new ConflictException("사용할 수 없는 메모 ID예요.");
		}
		memory.update(request.title().strip(), request.text().strip(), clock.instant());
		return MemoryResponse.of(memories.save(memory));
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void delete(@PathVariable UUID id) {
		memories.delete(memories.findByIdAndUserId(id.toString(), currentUser.id())
			.orElseThrow(() -> new NotFoundException("메모를 찾을 수 없어요.")));
	}

}
