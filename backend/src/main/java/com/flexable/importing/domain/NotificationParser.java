package com.flexable.importing.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;

/**
 * 카드사 · 은행 결제 알림(앱 푸시, 문자, 알림톡) 원문에서 거래를 추출한다. 기기는 원문만 수집하고 금액 · 가맹점 판단은
 * 여기서 한다. 결제 · 출금 · 입금이 아닌 알림, 광고, 승인 취소는 버린다.
 */
public final class NotificationParser {

	/**
	 * 기기가 보낸 알림 원문.
	 *
	 * @param id 기기가 알림마다 부여한 안정적인 키 (재전송 시 같은 값)
	 * @param bigText 펼친 알림 본문 (있으면 text 대신 사용)
	 * @param postedAt epoch millis
	 */
	public record RawNotification(String id, String packageName, String title, String text, String bigText,
			long postedAt) {
	}

	private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

	private static final Pattern IGNORED = Pattern.compile("광고|이벤트|혜택\\s*안내|쿠폰|인증번호|수신거부");

	private static final Pattern FAILED = Pattern.compile("취소|거절|실패|한도\\s*초과");

	private static final Pattern PAYMENT = Pattern.compile("승인|결제|출금|입금|사용|이체|체크");

	private static final Pattern MONEY = Pattern.compile("(\\d{1,3}(?:,\\d{3})+|\\d+)\\s*원");

	private static final Pattern NOT_PAYMENT_AMOUNT = Pattern.compile("누적|잔액|한도|포인트|적립|가능");

	private static final Pattern MONTH_DAY = Pattern.compile("(?:^|[^\\d])(\\d{1,2})[/.](\\d{1,2})(?:\\s|$|\\(|[^\\d])");

	private static final Pattern CREDIT_CARD_ISSUER = Pattern
		.compile("(신한|KB국민|국민|삼성|현대|롯데|우리|하나|BC|비씨|NH|농협|씨티|IBK)\\s*카드", Pattern.CASE_INSENSITIVE);

	private static final Pattern TIME = Pattern.compile("\\d{1,2}:\\d{2}");

	private static final Pattern LETTER = Pattern.compile("[가-힣A-Za-z]");

	private NotificationParser() {
	}

	public static Optional<ImportedRow> parse(RawNotification n) {
		String body = n.bigText() != null && !n.bigText().isBlank() ? n.bigText() : nullToEmpty(n.text());
		String raw = (nullToEmpty(n.title()) + "\n" + body).replace("\r", "");
		if (IGNORED.matcher(raw).find() || FAILED.matcher(raw).find() || !PAYMENT.matcher(raw).find()) {
			return Optional.empty();
		}
		long amount = 0;
		String amountText = "";
		Matcher money = MONEY.matcher(raw);
		while (money.find()) {
			String before = raw.substring(Math.max(0, money.start() - 6), money.start());
			if (NOT_PAYMENT_AMOUNT.matcher(before).find()) {
				continue;
			}
			try {
				amount = Long.parseLong(money.group(1).replace(",", ""));
			}
			catch (NumberFormatException ex) {
				return Optional.empty();
			}
			amountText = money.group();
			break;
		}
		if (amount <= 0) {
			return Optional.empty();
		}
		LocalDate postedDate = Instant.ofEpochMilli(n.postedAt()).atZone(ZONE).toLocalDate();
		LocalDate date = postedDate;
		Matcher md = MONTH_DAY.matcher(raw);
		if (md.find()) {
			Optional<LocalDate> candidate = Dates.of(String.valueOf(postedDate.getYear()), md.group(1), md.group(2));
			if (candidate.isPresent() && candidate.get().isAfter(postedDate)) {
				// 1월 초에 받은 12월 거래 알림
				candidate = Dates.of(String.valueOf(postedDate.getYear() - 1), md.group(1), md.group(2));
			}
			if (candidate.isPresent()) {
				date = candidate.get();
			}
		}
		boolean income = raw.contains("입금") && !Pattern.compile("출금|승인|결제").matcher(raw).find();
		PaymentMethod method = !income && CREDIT_CARD_ISSUER.matcher(raw).find()
				&& Pattern.compile("승인|일시불|할부").matcher(raw).find() && !raw.contains("체크") ? PaymentMethod.CARD
						: PaymentMethod.CASH;

		String stripped = raw.replaceAll("(누적|잔액|한도|포인트|적립)[^\\n|]*", "\n");
		stripped = stripped.replaceFirst(Pattern.quote(amountText), "\n");
		stripped = stripped.replaceAll("\\[[^\\]]*\\]", " ")
			.replaceAll("\\d{1,2}[/.]\\d{1,2}(\\s*\\d{1,2}:\\d{2})?", "\n")
			.replaceAll("\\d{1,2}:\\d{2}(:\\d{2})?", "\n")
			.replaceAll("[가-힣A-Z]\\*+[가-힣A-Z]?님?", " ")
			.replaceAll("\\(?\\d{3,4}\\)?\\*?", " ")
			.replaceAll("일시불|할부\\s*\\d*\\s*개월?|\\d+개월", " ");
		stripped = CREDIT_CARD_ISSUER.matcher(stripped).replaceFirst(" ");
		stripped = Pattern
			.compile("(체크|신용)?카드|은행|뱅크|승인|결제\\s*완료|결제|출금|입금|사용|이체|완료|알림|web발신", Pattern.CASE_INSENSITIVE)
			.matcher(stripped)
			.replaceAll(" ");
		List<String> parts = Arrays.stream(stripped.split("\\n|\\||·"))
			.map((p) -> p.replaceAll("\\s+", " ").strip())
			.filter((p) -> p.length() >= 2 && LETTER.matcher(p).find())
			.toList();
		String title;
		if (parts.isEmpty()) {
			title = income ? "입금" : "결제 알림 확인 필요";
		}
		else {
			title = TIME.matcher(raw).find() ? parts.getLast() : parts.getFirst();
		}
		title = CsvImport.truncate(title, 60);
		return Optional.of(new ImportedRow(title, amount, date, income ? TransactionKind.INCOME : TransactionKind.EXPENSE,
				method, income ? Category.ETC : CategoryGuesser.guess(title), "noti:" + n.id()));
	}

	private static String nullToEmpty(String value) {
		return value != null ? value : "";
	}

}
