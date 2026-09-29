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

}
