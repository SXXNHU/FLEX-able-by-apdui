package com.flexable.ledger.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import com.flexable.common.error.ConflictException;
import com.flexable.common.error.NotFoundException;
import com.flexable.ledger.domain.Ledger;
import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionSource;
import com.flexable.ledger.persistence.LedgerStore;
import com.flexable.ledger.persistence.ReconciledDateRepository;
import com.flexable.ledger.persistence.TransactionEntity;
import com.flexable.ledger.persistence.TransactionRepository;
import com.flexable.user.CurrentUser;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TransactionService {

	/** @param replayed 같은 ID의 같은 요청이 이미 반영돼 있어 아무것도 바꾸지 않았음 */
	public record Created(TransactionResponse transaction, boolean replayed) {
	}

	private final LedgerStore store;

	private final TransactionRepository transactions;

	private final ReconciledDateRepository reconciled;

	private final CurrentUser currentUser;

	private final Clock clock;

	TransactionService(LedgerStore store, TransactionRepository transactions, ReconciledDateRepository reconciled,
			CurrentUser currentUser, Clock clock) {
		this.store = store;
		this.transactions = transactions;
		this.reconciled = reconciled;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<TransactionResponse> list() {
		return store.load(currentUser.id())
			.ledger()
			.transactions()
			.stream()
			.sorted((a, b) -> b.date().compareTo(a.date()))
			.map(TransactionResponse::of)
			.toList();
	}

	@Transactional
	public Created create(TransactionRequest request) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		String id = (request.id() != null ? request.id() : UUID.randomUUID()).toString();
		var existing = loaded.ledger().find(id);
		if (existing.isPresent()) {
			if (sameRequest(existing.get(), request)) {
				return new Created(TransactionResponse.of(existing.get()), true);
			}
			throw new ConflictException("같은 ID로 다른 거래가 이미 반영돼 있어요.");
		}
		if (transactions.existsById(id)) {
			throw new ConflictException("사용할 수 없는 거래 ID예요.");
		}
		LedgerTransaction tx = toDomain(id, request,
				request.source() != null ? request.source() : TransactionSource.MANUAL, null);
		Ledger.Applied applied = loaded.ledger().add(tx, today());
		Instant now = clock.instant();
		transactions.save(TransactionEntity.of(userId, applied.transaction(), now));
		loaded.profile().applyMoney(applied.ledger().profile(), now);
		reconciled.deleteDay(userId, applied.transaction().date());
		return new Created(TransactionResponse.of(applied.transaction()), false);
	}

	/** 기존 반영을 되돌리고 같은 ID로 다시 반영한다. 출처와 외부 이벤트 ID는 유지한다. */
	@Transactional
	public TransactionResponse replace(String id, TransactionRequest request) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		LedgerTransaction before = loaded.ledger().find(id).orElseThrow(TransactionService::notFound);
		Ledger removed = loaded.ledger().remove(id);
		Ledger.Applied applied = removed
			.add(toDomain(id, request, before.source(), before.sourceEventId()), today());
		TransactionEntity entity = transactions.findByIdAndUserId(id, userId).orElseThrow();
		Instant createdAt = entity.getCreatedAt();
		transactions.delete(entity);
		transactions.flush();
		transactions.save(TransactionEntity.of(userId, applied.transaction(), createdAt));
		loaded.profile().applyMoney(applied.ledger().profile(), clock.instant());
		reconciled.deleteDay(userId, before.date());
		reconciled.deleteDay(userId, applied.transaction().date());
		return TransactionResponse.of(applied.transaction());
	}

	@Transactional
	public void delete(String id) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		LedgerTransaction before = loaded.ledger().find(id).orElseThrow(TransactionService::notFound);
		Ledger next = loaded.ledger().remove(id);
		transactions.deleteById(id);
		loaded.profile().applyMoney(next.profile(), clock.instant());
		reconciled.deleteDay(userId, before.date());
	}

	static LedgerTransaction toDomain(String id, TransactionRequest r, TransactionSource source,
			String sourceEventId) {
		return new LedgerTransaction(id, r.title(), r.amount(), r.date(), r.category(), r.kind(),
				r.method() != null ? r.method() : PaymentMethod.CASH, str(r.planId()), str(r.fixedId()),
				str(r.refundOf()), r.closesItem(), source, sourceEventId);
	}

	/** 재전송 판별: 사용자가 입력한 핵심 값이 같으면 같은 요청으로 본다. */
	private static boolean sameRequest(LedgerTransaction t, TransactionRequest r) {
		return t.amount() == r.amount() && t.date().equals(r.date()) && t.kind() == r.kind()
				&& t.title().equals(r.title().strip()) && Objects.equals(t.refundOf(), str(r.refundOf()));
	}

	private static String str(UUID id) {
		return id != null ? id.toString() : null;
	}

	private LocalDate today() {
		return LocalDate.now(clock);
	}

	private static NotFoundException notFound() {
		return new NotFoundException("거래를 찾을 수 없어요.");
	}

}
