package com.flexable.profile;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
class ProfileController {

	private final ProfileService service;

	ProfileController(ProfileService service) {
		this.service = service;
	}

	@GetMapping
	ProfileResponse get() {
		return service.get();
	}

	@PutMapping
	ProfileResponse save(@Valid @RequestBody ProfileRequest request) {
		return service.save(request);
	}

	/** 정산 알림 설정. 예산 설정 폼을 저장해도 덮어쓰지 않도록 따로 둔다. */
	@PutMapping("/settings")
	ProfileResponse saveSettings(@Valid @RequestBody ProfileService.SettingsRequest request) {
		return service.saveSettings(request);
	}

}
