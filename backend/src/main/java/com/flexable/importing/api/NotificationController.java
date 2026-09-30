package com.flexable.importing.api;

import java.util.List;
import java.util.UUID;

import com.flexable.importing.application.ImportModels.NotificationInput;
import com.flexable.importing.application.NotificationIngestService;
import com.flexable.importing.application.NotificationIngestService.InboxItem;
import com.flexable.importing.application.NotificationIngestService.IngestResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 결제 알림 자동 등록과 확인 대기함. 웹 · 모바일 구분 없는 같은 API다. */
@RestController
class NotificationController {

	record IngestRequest(@NotNull @Size(max = 200) List<@Valid NotificationInput> notifications) {
	}

	private final NotificationIngestService service;

	NotificationController(NotificationIngestService service) {
		this.service = service;
	}

	@PostMapping("/api/notifications/ingest")
	IngestResult ingest(@Valid @RequestBody IngestRequest request) {
		return service.ingest(request.notifications());
	}

	@GetMapping("/api/inbox")
	List<InboxItem> inbox() {
		return service.inbox();
	}

	@PostMapping("/api/inbox/{id}/accept")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void accept(@PathVariable UUID id) {
		service.accept(id.toString());
	}

	@DeleteMapping("/api/inbox/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void dismiss(@PathVariable UUID id) {
		service.dismiss(id.toString());
	}

}
