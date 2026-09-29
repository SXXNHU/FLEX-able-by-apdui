package com.flexable.ledger.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.flexable.ledger.application.BudgetService;
import com.flexable.ledger.application.BudgetService.BudgetResponse;
import com.flexable.ledger.application.BudgetService.PreviewResponse;
import com.flexable.ledger.application.BudgetService.ReconciliationResponse;
import com.flexable.ledger.application.FixedExpenseService;
import com.flexable.ledger.application.FixedExpenseService.FixedExpenseRequest;
import com.flexable.ledger.application.FixedExpenseService.FixedExpenseResponse;
import com.flexable.ledger.application.PlanService;
import com.flexable.ledger.application.PlanService.PlanRequest;
import com.flexable.ledger.application.PlanService.PlanResponse;
import com.flexable.ledger.application.TransactionRequest;
import com.flexable.ledger.application.TransactionResponse;
import com.flexable.ledger.application.TransactionService;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.Estimate;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 원장 REST API. 웹과 모바일이 같은 API를 쓴다. */
final class LedgerControllers {

	private LedgerControllers() {
	}

	@RestController
	@RequestMapping("/api/budgets")
	static class Budgets {

		private final BudgetService service;

		Budgets(BudgetService service) {
			this.service = service;
		}

		@GetMapping("/today")
		BudgetResponse today() {
			return service.today();
		}

		@PostMapping("/preview")
		PreviewResponse preview(@RequestParam(required = false) UUID planId, @Valid @RequestBody PlanRequest request) {
			return service.preview(planId != null ? planId.toString() : null, request);
		}

	}

	@RestController
	@RequestMapping("/api/transactions")
	static class Transactions {

		private final TransactionService service;

		Transactions(TransactionService service) {
			this.service = service;
		}

		@GetMapping
		List<TransactionResponse> list() {
			return service.list();
		}

		/** 새로 반영하면 201, 같은 ID의 같은 요청을 다시 보내면 반영 없이 200 */
		@PostMapping
		ResponseEntity<TransactionResponse> create(@Valid @RequestBody TransactionRequest request) {
			TransactionService.Created created = service.create(request);
			return ResponseEntity.status(created.replayed() ? HttpStatus.OK : HttpStatus.CREATED)
				.body(created.transaction());
		}

		@PutMapping("/{id}")
		TransactionResponse replace(@PathVariable UUID id, @Valid @RequestBody TransactionRequest request) {
			return service.replace(id.toString(), request);
		}

		@DeleteMapping("/{id}")
		@ResponseStatus(HttpStatus.NO_CONTENT)
		void delete(@PathVariable UUID id) {
			service.delete(id.toString());
		}

	}

	@RestController
	@RequestMapping("/api/plans")
	static class Plans {

		private final PlanService service;

		Plans(PlanService service) {
			this.service = service;
		}

		@GetMapping
		List<PlanResponse> list() {
			return service.list();
		}

		@PutMapping("/{id}")
		PlanResponse save(@PathVariable UUID id, @Valid @RequestBody PlanRequest request) {
			return service.save(id.toString(), request);
		}

		@DeleteMapping("/{id}")
		@ResponseStatus(HttpStatus.NO_CONTENT)
		void delete(@PathVariable UUID id) {
			service.delete(id.toString());
		}

		/** 비교할 정산 기록이 없으면 204 */
		@GetMapping("/estimate")
		ResponseEntity<Estimate> estimate(@RequestParam Category category) {
			return service.estimate(category)
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.noContent().build());
		}

	}

	@RestController
	@RequestMapping("/api/fixed-expenses")
	static class FixedExpenses {

		private final FixedExpenseService service;

		FixedExpenses(FixedExpenseService service) {
			this.service = service;
		}

		@GetMapping
		List<FixedExpenseResponse> list() {
			return service.list();
		}

		@PutMapping("/{id}")
		FixedExpenseResponse save(@PathVariable UUID id, @Valid @RequestBody FixedExpenseRequest request) {
			return service.save(id.toString(), request);
		}

		@DeleteMapping("/{id}")
		@ResponseStatus(HttpStatus.NO_CONTENT)
		void delete(@PathVariable UUID id) {
			service.delete(id.toString());
		}

	}

	@RestController
	@RequestMapping("/api/reconciliations")
	static class Reconciliations {

		private final BudgetService service;

		Reconciliations(BudgetService service) {
			this.service = service;
		}

		@GetMapping
		ReconciliationResponse list() {
			return service.reconciliations();
		}

		@PostMapping("/{date}")
		ReconciliationResponse reconcile(@PathVariable LocalDate date) {
			return service.reconcile(date);
		}

	}

}
