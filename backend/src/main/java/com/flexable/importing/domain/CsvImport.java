package com.flexable.importing.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;

/** 은행 · 카드사 CSV 내보내기에서 거래 후보를 만든다. 인코딩 판별은 파일 바이트를 가진 클라이언트가 한다. */
public final class CsvImport {

	/**
	 * 열 번호(0부터, 없으면 -1).
	 *
	 * @param amount 금액 열이 하나일 때 (카드 이용내역, 부호 있는 계좌 내역)
	 * @param withdraw 계좌 내역의 출금 열 (지정하면 amount는 쓰지 않음)
	 * @param type 입금/출금 · 승인/취소 구분 열
	 */
	public record Mapping(int headerRow, int date, int title, int amount, int withdraw, int deposit, int type) {

		public boolean usable() {
			return date >= 0 && (amount >= 0 || withdraw >= 0);
		}

	}

	public record Result(List<ImportedRow> rows, int skipped) {
	}

	private static final Map<String, List<String>> KEYWORDS = Map.of("date",
			List.of("거래일시", "거래일자", "이용일시", "이용일자", "승인일시", "승인일자", "거래일", "이용일", "승인일", "결제일", "일자", "날짜", "일시",
					"date"),
			"title",
			List.of("가맹점명", "이용가맹점", "이용하신곳", "이용처", "가맹점", "사용처", "상호", "거래처", "받는분", "보낸분", "적요", "거래내용", "기재내용", "내용",
					"메모", "description", "merchant"),
			"withdraw", List.of("출금금액", "출금액", "찾으신금액", "지급금액", "출금"), "deposit",
			List.of("입금금액", "입금액", "맡기신금액", "입금"), "amount",
			List.of("이용금액", "승인금액", "결제금액", "거래금액", "결제원금", "금액", "amount"), "type",
			List.of("입출금구분", "거래구분", "승인구분", "거래유형", "구분", "상태", "type"));

	private static final Pattern CANCELLED = Pattern.compile("취소|거절|실패");

	private static final Pattern TOTAL_ROW = Pattern.compile("합계|총계|소계");

	private static final Pattern NEGATIVE = Pattern.compile("^\\s*[-−(]|-\\s*$");

	private static final Pattern EXCEL_SERIAL = Pattern.compile("^\\d{5}(\\.\\d+)?$");

	private static final Pattern COMPACT_DATE = Pattern.compile("^(20\\d{2})(\\d{2})(\\d{2})");

	private static final Pattern FULL_DATE = Pattern
		.compile("(\\d{2,4})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})");

	private static final Pattern SHORT_DATE = Pattern.compile("^(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})");

	private CsvImport() {
	}

	/** RFC 4180 CSV. 구분자는 첫 줄에서 탭 · 세미콜론 · 쉼표 중 가장 많이 나온 것 */
	public static List<List<String>> parse(String text) {
		String firstLine = text.split("\\r?\\n", 2)[0];
		char delimiter = ',';
		for (char d : new char[] { '\t', ';', ',' }) {
			if (count(firstLine, d) > count(firstLine, delimiter)) {
				delimiter = d;
			}
		}
		List<List<String>> rows = new ArrayList<>();
		List<String> row = new ArrayList<>();
		StringBuilder cell = new StringBuilder();
		boolean quoted = false;
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (quoted) {
				if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
					cell.append('"');
					i++;
				}
				else if (c == '"') {
					quoted = false;
				}
				else {
					cell.append(c);
				}
			}
			else if (c == '"' && cell.isEmpty()) {
				quoted = true;
			}
			else if (c == delimiter) {
				row.add(cell.toString().strip());
				cell.setLength(0);
			}
			else if (c == '\n' || c == '\r') {
				if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
					i++;
				}
				row.add(cell.toString().strip());
				addIfNotBlank(rows, row);
				row = new ArrayList<>();
				cell.setLength(0);
			}
			else {
				cell.append(c);
			}
		}
		row.add(cell.toString().strip());
		addIfNotBlank(rows, row);
		return rows;
	}

	/** 은행마다 위쪽에 안내 문구가 있어 앞쪽 30행에서 머리행을 찾는다. */
	public static Optional<Mapping> detect(List<List<String>> rows) {
		for (int headerRow = 0; headerRow < Math.min(30, rows.size()); headerRow++) {
			List<String> header = rows.get(headerRow);
			int date = findColumn(header, "date");
			if (date < 0) {
				continue;
			}
			int withdraw = findColumn(header, "withdraw", date);
			int deposit = findColumn(header, "deposit", date, withdraw);
			int amount = withdraw >= 0 ? -1 : findColumn(header, "amount", date, withdraw, deposit);
			if (amount < 0 && withdraw < 0) {
				continue;
			}
			int title = findColumn(header, "title", date, withdraw, deposit, amount);
			int type = findColumn(header, "type", date, withdraw, deposit, amount, title);
			return Optional.of(new Mapping(headerRow, date, title, amount, withdraw, deposit, type));
		}
		return Optional.empty();
	}

	/** 카드 이용내역으로 보이는 머리행 (가맹점 · 승인 열이 있고 잔액 · 출금 열이 없음) */
	public static boolean looksLikeCreditCard(List<List<String>> rows, Mapping mapping) {
		String header = String.join(" ", rows.get(mapping.headerRow()));
		return Pattern.compile("이용하신곳|가맹점|승인").matcher(header).find()
				&& !Pattern.compile("잔액|출금").matcher(header).find();
	}

	public static Result rows(List<List<String>> table, Mapping mapping, LocalDate today, PaymentMethod method) {
		List<List<String>> body = table.subList(Math.min(table.size(), mapping.headerRow() + 1), table.size());
		boolean signed = mapping.amount() >= 0 && mapping.withdraw() < 0
				&& body.stream().anyMatch((r) -> parseMoney(cell(r, mapping.amount())) < 0);
		List<ImportedRow> result = new ArrayList<>();
		int skipped = 0;
		for (List<String> r : body) {
			Optional<LocalDate> date = parseLooseDate(cell(r, mapping.date()), String.valueOf(today.getYear()));
			String type = mapping.type() >= 0 ? cell(r, mapping.type()) : "";
			long amount;
			TransactionKind kind;
			if (mapping.withdraw() >= 0) {
				long out = Math.abs(parseMoney(cell(r, mapping.withdraw())));
				long in = mapping.deposit() >= 0 ? Math.abs(parseMoney(cell(r, mapping.deposit()))) : 0;
				amount = out != 0 ? out : in;
				kind = out != 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME;
			}
			else {
				long value = parseMoney(cell(r, mapping.amount()));
				amount = Math.abs(value);
				kind = signed ? (value < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME)
						: type.contains("입금") ? TransactionKind.INCOME : TransactionKind.EXPENSE;
			}
			if (date.isEmpty() || date.get().isAfter(today) || amount == 0 || CANCELLED.matcher(type).find()) {
				String joined = String.join("", r);
				if (!joined.isBlank() && !TOTAL_ROW.matcher(joined).find()) {
					skipped++;
				}
				continue;
			}
			String title = mapping.title() >= 0 ? cell(r, mapping.title()).strip() : "";
			title = title.isEmpty() ? "내역 확인 필요" : truncate(title, 60);
			result.add(new ImportedRow(title, amount, date.get(), kind,
					kind == TransactionKind.EXPENSE ? method : PaymentMethod.CASH, CategoryGuesser.guess(title), null));
		}
		return new Result(result, skipped);
	}

	/** "1,000원", "-4500", "(3,000)" 등. 소수는 반올림 */
	public static long parseMoney(String value) {
		if (value == null || value.isBlank()) {
			return 0;
		}
		boolean negative = NEGATIVE.matcher(value).find();
		String digits = value.replaceAll("[^\\d.]", "");
		if (digits.isEmpty() || digits.chars().filter((c) -> c == '.').count() > 1 || digits.equals(".")) {
			return 0;
		}
		try {
			long amount = new BigDecimal(digits).setScale(0, RoundingMode.HALF_UP).longValueExact();
			return negative ? -amount : amount;
		}
		catch (ArithmeticException | NumberFormatException ex) {
			return 0;
		}
	}

	/** "2026.09.28 12:30", "20260928", "26.09.28", "09/28", 엑셀 일련번호 */
	public static Optional<LocalDate> parseLooseDate(String value, String fallbackYear) {
		if (value == null || value.isBlank()) {
			return Optional.empty();
		}
		String text = value.strip();
		if (EXCEL_SERIAL.matcher(text).matches()) {
			long serial = (long) Math.floor(Double.parseDouble(text));
			if (serial > 30000 && serial < 80000) {
				return Optional.of(LocalDate.of(1899, 12, 30).plusDays(serial));
			}
		}
		Matcher compact = COMPACT_DATE.matcher(text);
		if (compact.find()) {
			return Dates.of(compact.group(1), compact.group(2), compact.group(3));
		}
		Matcher full = FULL_DATE.matcher(text);
		if (full.find()) {
			String year = full.group(1).length() == 2 ? "20" + full.group(1) : full.group(1);
			return Dates.of(year, full.group(2), full.group(3));
		}
		Matcher shortDate = SHORT_DATE.matcher(text);
		if (shortDate.find()) {
			return Dates.of(fallbackYear, shortDate.group(1), shortDate.group(2));
		}
		return Optional.empty();
	}

	private static int findColumn(List<String> header, String key, int... taken) {
		List<String> keywords = KEYWORDS.get(key);
		for (String keyword : keywords) {
			for (int i = 0; i < header.size(); i++) {
				if (!isTaken(i, taken) && clean(header.get(i)).equals(keyword)) {
					return i;
				}
			}
		}
		for (String keyword : keywords) {
			for (int i = 0; i < header.size(); i++) {
				if (!isTaken(i, taken) && clean(header.get(i)).contains(keyword)) {
					return i;
				}
			}
		}
		return -1;
	}

	private static boolean isTaken(int index, int[] taken) {
		for (int t : taken) {
			if (t == index) {
				return true;
			}
		}
		return false;
	}

	private static String clean(String value) {
		return value.replaceAll("[\\s\"'()\\[\\]]", "").toLowerCase(Locale.ROOT);
	}

	private static String cell(List<String> row, int index) {
		return index >= 0 && index < row.size() ? row.get(index) : "";
	}

	private static int count(String text, char c) {
		return (int) text.chars().filter((x) -> x == c).count();
	}

	private static void addIfNotBlank(List<List<String>> rows, List<String> row) {
		if (row.stream().anyMatch((s) -> !s.isEmpty())) {
			rows.add(row);
		}
	}

	static String truncate(String value, int max) {
		return value.length() > max ? value.substring(0, max) : value;
	}

}
