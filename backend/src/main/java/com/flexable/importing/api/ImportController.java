package com.flexable.importing.api;

import com.flexable.importing.application.ImportModels.CandidatesRequest;
import com.flexable.importing.application.ImportModels.CandidatesResponse;
import com.flexable.importing.application.ImportModels.ImportRequest;
import com.flexable.importing.application.ImportModels.ImportResponse;
import com.flexable.importing.application.ImportService;
import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/transactions")
class ImportController {

	private final ImportService service;

	ImportController(ImportService service) {
		this.service = service;
	}

	@PostMapping("/import-candidates")
	CandidatesResponse candidates(@Valid @RequestBody CandidatesRequest request) {
		return service.candidates(request);
	}

	@PostMapping("/import")
	ImportResponse importItems(@Valid @RequestBody ImportRequest request) {
		return service.importItems(request);
	}

}
