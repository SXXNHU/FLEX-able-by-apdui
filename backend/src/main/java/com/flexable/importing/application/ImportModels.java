package com.flexable.importing.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.flexable.importing.domain.CsvImport;
import com.flexable.importing.domain.DuplicateFinder;
import com.flexable.importing.domain.NotificationParser.RawNotification;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 가져오기 API 요청 · 응답 */
public final class ImportModels {

	private ImportModels() {
	}

	/**
	 * 원문을 보내 후보를 받는다. 저장하지 않는다.
	 *
	 * @param text CSV: 디코딩된 파일 내용, CAPTURE: OCR 문자
	 * @param mapping CSV 열 지정 (비우면 자동 판별)
	 * @param creditCard CSV가 신용카드 이용내역인지 (비우면 머리행으로 추측)
	 * @param fallbackDate CAPTURE: 날짜를 찾지 못한 줄에 쓸 거래일
	 */
	public record CandidatesRequest(@NotNull TransactionSource source, @Size(max = 5_000_000) String text,
			CsvImport.Mapping mapping, Boolean creditCard, LocalDate fallbackDate,
			@Size(max = 500) List<@Valid NotificationInput> notifications) {

		@AssertTrue(message = "CSV · 캡처 · 결제 알림만 후보를 만들 수 있어요.")
		public boolean isSupportedSource() {
			return source == TransactionSource.CSV || source == TransactionSource.CAPTURE
					|| source == TransactionSource.NOTIFICATION;
		}

	}

	public record NotificationInput(@NotBlank @Size(max = 150) String id, @Size(max = 200) String packageName,
			@Size(max = 1000) String title, @Size(max = 4000) String text, @Size(max = 4000) String bigText,
			long postedAt) {

		RawNotification toRaw() {
			return new RawNotification(id, packageName, title, text, bigText, postedAt);
		}

	}

	/** 직접 입력 전 확인: 같은 결제가 이미 있는지. {@code excludeId}는 수정 중인 거래 자신 */
	public record DuplicateCheckRequest(@NotBlank @Size(max = 60) String title,
			@Min(1) @Max(1_000_000_000_000L) long amount, @NotNull LocalDate date, @NotNull TransactionKind kind,
			UUID excludeId) {
	}

	public record DuplicateInfo(String transactionId, String title, long amount, LocalDate date,
			TransactionSource source, DuplicateFinder.Level level) {
	}

	/**
	 * @param duplicates 이미 등록된 거래 중 같은 결제로 보이는 것
	 * @param sameAsCandidate 같은 요청 안에서 완전히 같은 앞선 후보의 번호 (없으면 null)
	 * @param alreadyImported 같은 외부 이벤트가 이미 거래로 반영됨 (다시 가져오지 않음)
	 */
	public record Candidate(String title, long amount, LocalDate date, TransactionKind kind, PaymentMethod method,
			Category category, String sourceEventId, List<DuplicateInfo> duplicates, Integer sameAsCandidate,
			boolean alreadyImported) {
	}

	/** CSV 열 지정 화면에 필요한 정보 */
	public record CsvInfo(CsvImport.Mapping mapping, boolean detected, boolean creditCard,
			List<List<String>> headRows) {
	}

	public record CandidatesResponse(List<Candidate> candidates, int skipped, CsvInfo csv) {
	}

	/**
	 * 사용자가 확인한 후보를 반영한다.
	 *
	 * @param acceptDuplicates 중복 의심을 알고도 추가하기로 한 항목 ID
	 */
	public record ImportRequest(@NotNull TransactionSource source,
			@NotEmpty(message = "반영할 거래를 선택해주세요.") @Size(max = 1000) List<@Valid ImportItem> items,
			Set<UUID> acceptDuplicates) {

		@AssertTrue(message = "가져오기로 만들 수 없는 거래 출처예요.")
		public boolean isImportSource() {
			return source != null && source != TransactionSource.MANUAL && source != TransactionSource.DEMO;
		}

	}

	/** @param id 클라이언트가 만든 UUID. 같은 항목을 다시 보내면 한 번만 반영된다. */
	public record ImportItem(@NotNull UUID id, @NotBlank @Size(max = 60) String title,
			@Min(1) @Max(1_000_000_000_000L) long amount, @NotNull LocalDate date, @NotNull Category category,
			@NotNull TransactionKind kind, PaymentMethod method, UUID planId, UUID fixedId, boolean closesItem,
			@Size(max = 200) String sourceEventId) {

		@AssertTrue(message = "가져오기는 지출 · 입금 · 내 계좌 이체만 지원해요. 환불과 카드대금은 직접 입력해주세요.")
		public boolean isImportKind() {
			return kind == TransactionKind.EXPENSE || kind == TransactionKind.INCOME
					|| kind == TransactionKind.TRANSFER;
		}

	}

	/**
	 * @param created 새로 반영한 항목 ID
	 * @param replayed 이미 반영돼 있어 건너뛴 항목 ID (재전송)
	 */
	public record ImportResponse(List<String> created, List<String> replayed) {
	}

}
