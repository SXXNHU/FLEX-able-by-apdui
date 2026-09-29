package com.flexable.importing.domain;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;

/**
 * 결제내역 캡처에서 OCR로 읽은 문자를 거래 후보로 바꾼다. 이미지 인식은 기기에서 하고 서버는 문자만 받는다. 잔액 ·
 * 합계 줄은 거래가 아니므로 제외한다.
 */
public final class CaptureText {

	private static final Pattern DATE = Pattern
		.compile("(?:(20\\d{2})[.\\-/년]\\s*)?(\\d{1,2})[.\\-/월]\\s*(\\d{1,2})(?:일)?");

	private static final Pattern MONEY = Pattern.compile("[-−]?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+)\\s*원");

	private static final Pattern NOT_A_TRANSACTION = Pattern.compile("잔액|총액|합계|한도|누적");

	private static final Pattern HEADING = Pattern.compile("잔액|결제내역|이용내역|거래내역");

	private static final Pattern TIME = Pattern.compile("\\d{1,2}:\\d{2}");

	private CaptureText() {
	}

	public static List<ImportedRow> parse(String text, LocalDate fallbackDate) {
		LocalDate date = fallbackDate;
		String previous = "";
		List<ImportedRow> result = new ArrayList<>();
		for (String raw : text.split("\n")) {
			String line = raw.strip();
			if (line.isEmpty()) {
				continue;
			}
			Matcher dateMatch = DATE.matcher(line);
			boolean hasDate = dateMatch.find();
			if (hasDate) {
				String year = dateMatch.group(1) != null ? dateMatch.group(1) : String.valueOf(fallbackDate.getYear());
				var candidate = Dates.of(year, dateMatch.group(2), dateMatch.group(3));
				if (candidate.isPresent()) {
					date = candidate.get();
				}
			}
			Matcher money = MONEY.matcher(line);
			boolean hasMoney = money.find();
			if (hasMoney && !NOT_A_TRANSACTION.matcher(line).find()) {
				long amount = parseAmount(money.group(1));
				String title = line.replace(money.group(), "");
				title = TIME.matcher(title).replaceAll("");
				if (hasDate) {
					title = title.replace(dateMatch.group(), "");
				}
				title = title.strip();
				if (title.isEmpty()) {
					title = previous.isEmpty() ? "상호 확인 필요" : previous;
				}
				if (amount > 0) {
					title = CsvImport.truncate(title, 60);
					result.add(new ImportedRow(title, amount, date, TransactionKind.EXPENSE, PaymentMethod.CASH,
							CategoryGuesser.guess(title), null));
				}
			}
			if (!hasDate && !hasMoney && !HEADING.matcher(line).find()) {
				previous = line;
			}
		}
		return result;
	}

	private static long parseAmount(String digits) {
		try {
			return Long.parseLong(digits.replace(",", ""));
		}
		catch (NumberFormatException ex) {
			return 0;
		}
	}

}
