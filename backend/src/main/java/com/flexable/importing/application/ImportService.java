package com.flexable.importing.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.flexable.common.error.BusinessRuleException;
import com.flexable.common.error.ConflictException;
import com.flexable.importing.application.ImportModels.Candidate;
import com.flexable.importing.application.ImportModels.CandidatesRequest;
import com.flexable.importing.application.ImportModels.CandidatesResponse;
import com.flexable.importing.application.ImportModels.CsvInfo;
import com.flexable.importing.application.ImportModels.DuplicateInfo;
import com.flexable.importing.application.ImportModels.ImportItem;
import com.flexable.importing.application.ImportModels.ImportRequest;
import com.flexable.importing.application.ImportModels.ImportResponse;
import com.flexable.importing.domain.CaptureText;
import com.flexable.importing.domain.CsvImport;
import com.flexable.importing.domain.DuplicateFinder;
import com.flexable.importing.domain.ImportedRow;
import com.flexable.importing.domain.NotificationParser;
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

/**
 * 외부 원문 → 후보 → 사용자 확인 → 거래. 중복 판정과 멱등성의 최종 판단은 서버가 한다.
 */
@Service
public class ImportService {

	private final LedgerStore store;

	private final TransactionRepository transactions;

	private final ReconciledDateRepository reconciled;

	private final CurrentUser currentUser;

	private final Clock clock;

	ImportService(LedgerStore store, TransactionRepository transactions, ReconciledDateRepository reconciled,
			CurrentUser currentUser, Clock clock) {
		this.store = store;
		this.transactions = transactions;
		this.reconciled = reconciled;
		this.currentUser = currentUser;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public CandidatesResponse candidates(CandidatesRequest request) {
		Ledger ledger = store.load(currentUser.id()).ledger();
		LocalDate today = LocalDate.now(clock);
		List<ImportedRow> rows;
		int skipped = 0;
		CsvInfo csv = null;
		switch (request.source()) {
			case CSV -> {
				List<List<String>> table = CsvImport.parse(nullToEmpty(request.text()));
				Optional<CsvImport.Mapping> detected = CsvImport.detect(table);
				CsvImport.Mapping mapping = request.mapping() != null ? request.mapping()
						: detected.orElse(new CsvImport.Mapping(0, -1, -1, -1, -1, -1, -1));
				boolean creditCard = request.creditCard() != null ? request.creditCard()
						: detected.isPresent() && CsvImport.looksLikeCreditCard(table, mapping);
				csv = new CsvInfo(mapping, detected.isPresent(), creditCard, table.subList(0, Math.min(30, table.size())));
				if (mapping.usable() && mapping.headerRow() < table.size()) {
					CsvImport.Result result = CsvImport.rows(table, mapping, today,
							creditCard ? PaymentMethod.CARD : PaymentMethod.CASH);
					rows = result.rows();
					skipped = result.skipped();
				}
				else {
					rows = List.of();
				}
			}
			case CAPTURE -> rows = CaptureText.parse(nullToEmpty(request.text()),
					request.fallbackDate() != null ? request.fallbackDate() : today.minusDays(1));
			case NOTIFICATION -> {
				rows = new ArrayList<>();
				for (var n : request.notifications() != null ? request.notifications()
						: List.<ImportModels.NotificationInput>of()) {
					NotificationParser.parse(n.toRaw()).ifPresent(rows::add);
				}
				skipped = (request.notifications() != null ? request.notifications().size() : 0) - rows.size();
			}
			default -> throw new BusinessRuleException("unsupported_source", "지원하지 않는 가져오기 출처예요.");
		}
		String userId = currentUser.id();
		List<ImportedRow> valid = rows.stream().filter((r) -> !r.date().isAfter(today)).toList();
		List<Candidate> candidates = new ArrayList<>();
		for (int i = 0; i < valid.size(); i++) {
			ImportedRow r = valid.get(i);
			candidates.add(new Candidate(r.title(), r.amount(), r.date(), r.kind(), r.method(), r.category(),
					r.sourceEventId(),
					DuplicateFinder.find(ledger.transactions(), r.title(), r.amount(), r.date(), r.kind())
						.stream()
						.map(ImportService::info)
						.toList(),
					sameAsEarlier(valid, i),
					r.sourceEventId() != null && transactions
						.findByUserIdAndSourceAndSourceEventId(userId, request.source(), r.sourceEventId())
						.isPresent()));
		}
		return new CandidatesResponse(candidates, skipped, csv);
	}

	private static Integer sameAsEarlier(List<ImportedRow> rows, int index) {
		ImportedRow r = rows.get(index);
		String title = DuplicateFinder.normalizeTitle(r.title());
		for (int i = 0; i < index; i++) {
			ImportedRow e = rows.get(i);
			if (e.amount() == r.amount() && e.date().equals(r.date()) && e.kind() == r.kind()
					&& DuplicateFinder.normalizeTitle(e.title()).equals(title)) {
				return i;
			}
		}
		return null;
	}

	/**
	 * 모두 반영하거나 하나도 반영하지 않는다. 이미 반영된 항목(같은 ID 또는 같은 외부 이벤트)은 건너뛴다. 중복이 의심되는데
	 * 사용자가 추가를 확인하지 않은 항목이 있으면 전체를 거절하고 그 항목을 알려준다.
	 */
	@Transactional
	public ImportResponse importItems(ImportRequest request) {
		String userId = currentUser.id();
		LedgerStore.Loaded loaded = store.loadForUpdate(userId);
		Set<UUID> accepted = request.acceptDuplicates() != null ? request.acceptDuplicates() : Set.of();
		LocalDate today = LocalDate.now(clock);
		Ledger ledger = loaded.ledger();
		List<LedgerTransaction> added = new ArrayList<>();
		List<String> replayed = new ArrayList<>();
		List<String> needsConfirmation = new ArrayList<>();
		for (ImportItem item : request.items()) {
			String id = item.id().toString();
			if (isAlreadyImported(ledger, userId, request.source(), item)) {
				replayed.add(id);
				continue;
			}
			if (transactions.existsById(id)) {
				throw new ConflictException("사용할 수 없는 거래 ID예요.");
			}
			if (!accepted.contains(item.id()) && isDuplicate(loaded.ledger().transactions(), added, item)) {
				needsConfirmation.add(id);
			}
			Ledger.Applied applied = ledger.add(toDomain(item, request.source()), today);
			ledger = applied.ledger();
			added.add(applied.transaction());
		}
		if (!needsConfirmation.isEmpty()) {
			throw new BusinessRuleException("duplicate_requires_confirmation",
					"이미 있는 거래 같은 항목이 있어요. 그래도 추가할지 확인해주세요.", Map.of("items", needsConfirmation));
		}
		Instant now = clock.instant();
		for (LedgerTransaction t : added) {
			transactions.save(TransactionEntity.of(userId, t, now));
			reconciled.deleteDay(userId, t.date());
		}
		loaded.profile().applyMoney(ledger.profile(), now);
		return new ImportResponse(added.stream().map(LedgerTransaction::id).toList(), replayed);
	}

	/**
	 * 기존 거래와는 비슷한 것까지, 같은 요청 안의 앞선 항목과는 완전히 같은 것만 중복으로 본다. 한 파일에 같은 날 같은
	 * 금액의 다른 결제가 있는 경우는 흔하기 때문이다 (후보 화면과 같은 기준).
	 */
	private static boolean isDuplicate(List<LedgerTransaction> existing, List<LedgerTransaction> earlierInBatch,
			ImportItem item) {
		String title = item.title().strip();
		return !DuplicateFinder.find(existing, title, item.amount(), item.date(), item.kind()).isEmpty()
				|| DuplicateFinder.find(earlierInBatch, title, item.amount(), item.date(), item.kind())
					.stream()
					.anyMatch((m) -> m.level() == DuplicateFinder.Level.EXACT);
	}

	private boolean isAlreadyImported(Ledger ledger, String userId, TransactionSource source, ImportItem item) {
		if (ledger.find(item.id().toString()).isPresent()) {
			return true;
		}
		return item.sourceEventId() != null && transactions
			.findByUserIdAndSourceAndSourceEventId(userId, source, item.sourceEventId())
			.isPresent();
	}

	private static LedgerTransaction toDomain(ImportItem item, TransactionSource source) {
		return new LedgerTransaction(item.id().toString(), item.title(), item.amount(), item.date(), item.category(),
				item.kind(), item.method() != null ? item.method() : PaymentMethod.CASH,
				item.planId() != null ? item.planId().toString() : null,
				item.fixedId() != null ? item.fixedId().toString() : null, null, item.closesItem(), source,
				item.sourceEventId());
	}

	private static DuplicateInfo info(DuplicateFinder.Match m) {
		LedgerTransaction t = m.transaction();
		return new DuplicateInfo(t.id(), t.title(), t.amount(), t.date(), t.source(), m.level());
	}

	private static String nullToEmpty(String value) {
		return value != null ? value : "";
	}

}
