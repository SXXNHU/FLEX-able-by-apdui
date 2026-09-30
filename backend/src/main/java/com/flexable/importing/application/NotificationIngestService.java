package com.flexable.importing.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.common.error.NotFoundException;
import com.flexable.importing.application.ImportModels.DuplicateInfo;
import com.flexable.importing.application.ImportModels.NotificationInput;
import com.flexable.importing.domain.DuplicateFinder;
import com.flexable.importing.domain.ImportedRow;
import com.flexable.importing.domain.NotificationParser;
import com.flexable.importing.persistence.PendingImportEntity;
import com.flexable.importing.persistence.PendingImportRepository;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.Ledger;
import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import com.flexable.ledger.persistence.LedgerStore;
import com.flexable.ledger.persistence.ReconciledDateRepository;
import com.flexable.ledger.persistence.TransactionEntity;
import com.flexable.ledger.persistence.TransactionRepository;
import com.flexable.user.CurrentUser;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기기가 모은 결제 알림 원문을 받아 거래로 만든다. 사용자가 한 건씩 보지 않는 경로이므로:
 * <ul>
 * <li>같은 알림(sourceEventId)은 몇 번 와도 한 번만 처리한다.</li>
 * <li>다른 경로(캡처 · CSV · 직접 입력)로 이미 등록된 것 같은 결제는 반영하지 않고 확인 대기함에 넣는다.</li>
 * <li>결제 알림이 아니면 버린다.</li>
 * </ul>
 * 요청 전체가 한 트랜잭션이다. 성공하면 처리한 알림 ID를 돌려주고, 기기는 그 ID만 큐에서 지운다.
 */
@Service
public class NotificationIngestService {

	/** @param processed 기기 큐에서 지워도 되는 알림 ID (반영 · 보류 · 무시 모두 포함) */
	public record IngestResult(List<String> processed, int added, int queued, int ignored) {
	}

	/** @param duplicates 지금 기준으로 겹쳐 보이는 기존 거래 */
	public record InboxItem(String id, String title, long amount, LocalDate date, Category category,
			TransactionKind kind, PaymentMethod method, TransactionSource source, List<DuplicateInfo> duplicates) {
	}

	private static final TransactionSource SOURCE = TransactionSource.NOTIFICATION;

	private final LedgerStore store;

	private final TransactionRepository transactions;

	private final PendingImportRepository pending;

	private final ReconciledDateRepository reconciled;

	private final CurrentUser currentUser;

	private final Clock clock;

	NotificationIngestService(LedgerStore store, TransactionRepository transactions, PendingImportRepository pending,
			ReconciledDateRepository reconciled, CurrentUser currentUser, Clock clock) {
		this.store = store;
		this.transactions = transactions;
		this.pending = pending;
		this.reconciled = reconciled;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional
	public IngestResult ingest(List<NotificationInput> notifications) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		Ledger ledger = loaded.ledger();
		LocalDate today = LocalDate.now(clock);
		Instant now = clock.instant();
		List<String> processed = new ArrayList<>();
		List<LedgerTransaction> added = new ArrayList<>();
		int queued = 0;
		int ignored = 0;
		for (NotificationInput input : notifications) {
			processed.add(input.id());
			Optional<ImportedRow> parsed = NotificationParser.parse(input.toRaw());
			if (parsed.isEmpty() || alreadySeen(userId, parsed.get().sourceEventId())) {
				ignored++;
				continue;
			}
			ImportedRow row = parsed.get();
			if (!DuplicateFinder.find(ledger.transactions(), row.title(), row.amount(), row.date(), row.kind())
				.isEmpty()) {
				pending.save(new PendingImportEntity(UUID.randomUUID().toString(), userId, row, SOURCE, now));
				queued++;
				continue;
			}
			try {
				Ledger.Applied applied = ledger.add(toTransaction(row), today);
				ledger = applied.ledger();
				added.add(applied.transaction());
			}
			catch (BusinessRuleException ex) {
				// 규칙에 맞지 않는 알림(예: 기기 시계 오류로 미래 날짜)은 사용자가 보고 고치도록 보류한다.
				pending.save(new PendingImportEntity(UUID.randomUUID().toString(), userId, row, SOURCE, now));
				queued++;
			}
		}
		for (LedgerTransaction t : added) {
			transactions.save(TransactionEntity.of(userId, t, now));
			reconciled.deleteDay(userId, t.date());
		}
		loaded.profile().applyMoney(ledger.profile(), now);
		return new IngestResult(processed, added.size(), queued, ignored);
	}

	@Transactional(readOnly = true)
	public List<InboxItem> inbox() {
		String userId = currentUser.id();
		List<LedgerTransaction> existing = store.load(userId).ledger().transactions();
		return pending.findOpen(userId).stream().map((p) -> toItem(p, existing)).toList();
	}

	/** 사용자가 "따로 추가"를 골랐다. 중복 확인은 사용자가 했으므로 규칙 검증만 한다. */
	@Transactional
	public void accept(String id) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		PendingImportEntity item = pending.findOpen(id, userId).orElseThrow(NotificationIngestService::notFound);
		Ledger.Applied applied = loaded.ledger()
			.add(new LedgerTransaction(UUID.randomUUID().toString(), item.getTitle(), item.getAmount(),
					item.getTxDate(), item.getCategory(), item.getKind(), item.getMethod(), null, null, null, false,
					item.getSource(), item.getSourceEventId()), LocalDate.now(clock));
		Instant now = clock.instant();
		// 거래가 같은 sourceEventId를 가지므로 대기 항목은 지운다 (이후 같은 알림은 거래 쪽에서 걸러진다).
		pending.delete(item);
		pending.flush();
		transactions.save(TransactionEntity.of(userId, applied.transaction(), now));
		reconciled.deleteDay(userId, applied.transaction().date());
		loaded.profile().applyMoney(applied.ledger().profile(), now);
	}

	/** "이미 있어요": 반영하지 않는다. 같은 알림이 다시 와도 되살리지 않도록 기록은 남긴다. */
	@Transactional
	public void dismiss(String id) {
		pending.findOpen(id, currentUser.id())
			.orElseThrow(NotificationIngestService::notFound)
			.dismiss(clock.instant());
	}

	private boolean alreadySeen(String userId, String sourceEventId) {
		return transactions.findByUserIdAndSourceAndSourceEventId(userId, SOURCE, sourceEventId).isPresent()
				|| pending.existsByUserIdAndSourceAndSourceEventId(userId, SOURCE, sourceEventId);
	}

	private static LedgerTransaction toTransaction(ImportedRow row) {
		return new LedgerTransaction(UUID.randomUUID().toString(), row.title(), row.amount(), row.date(),
				row.category(), row.kind(), row.method(), null, null, null, false, SOURCE, row.sourceEventId());
	}

	private static InboxItem toItem(PendingImportEntity p, List<LedgerTransaction> existing) {
		return new InboxItem(p.getId(), p.getTitle(), p.getAmount(), p.getTxDate(), p.getCategory(), p.getKind(),
				p.getMethod(), p.getSource(),
				DuplicateFinder.find(existing, p.getTitle(), p.getAmount(), p.getTxDate(), p.getKind())
					.stream()
					.map((m) -> new DuplicateInfo(m.transaction().id(), m.transaction().title(),
							m.transaction().amount(), m.transaction().date(), m.transaction().source(), m.level()))
					.toList());
	}

	private static NotFoundException notFound() {
		return new NotFoundException("확인할 거래를 찾을 수 없어요.");
	}

}
