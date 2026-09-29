package com.flexable.importing.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.TransactionKind;

/**
 * 같은 결제가 이미 등록돼 있는지 찾는다. 캡처 · CSV · 알림 · 직접 입력처럼 출처가 달라 가맹점 표기가 조금씩 다른
 * 경우(스타벅스코리아 / 스타벅스 강남점)도 찾는다. 막지 않고 사용자 확인을 받기 위한 후보만 돌려준다.
 */
public final class DuplicateFinder {

	public enum Level {

		/** 같은 날짜 · 금액 · 이름 */
		EXACT,
		/** 같은 금액이면서 같은 날이거나, 하루 차이(승인일/매입일)이면서 이름이 비슷함 */
		LIKELY

	}

	public record Match(LedgerTransaction transaction, Level level) {
	}

	private DuplicateFinder() {
	}

	public static List<Match> find(List<LedgerTransaction> transactions, String title, long amount, LocalDate date,
			TransactionKind kind) {
		List<Match> matches = new ArrayList<>();
		String normalized = normalizeTitle(title);
		for (LedgerTransaction t : transactions) {
			if (t.amount() != amount || direction(t.kind()) != direction(kind)) {
				continue;
			}
			long gap = Math.abs(ChronoUnit.DAYS.between(t.date(), date));
			if (gap > 1) {
				continue;
			}
			if (gap == 0 && normalizeTitle(t.title()).equals(normalized)) {
				matches.add(new Match(t, Level.EXACT));
			}
			else if (gap == 0 || similarTitle(t.title(), title)) {
				matches.add(new Match(t, Level.LIKELY));
			}
		}
		matches.sort(Comparator.comparing(Match::level));
		return matches;
	}

	public static String normalizeTitle(String title) {
		return title.toLowerCase(Locale.ROOT)
			.replaceAll("\\(주\\)|㈜|주식회사|\\(유\\)|유한회사", "")
			.replaceAll("[^0-9a-z가-힣]", "");
	}

	public static boolean similarTitle(String a, String b) {
		String x = normalizeTitle(a);
		String y = normalizeTitle(b);
		if (x.isEmpty() || y.isEmpty()) {
			return false;
		}
		if (x.equals(y) || x.contains(y) || y.contains(x)) {
			return true;
		}
		List<String> left = bigrams(x);
		Set<String> right = new HashSet<>(bigrams(y));
		if (left.isEmpty() || right.isEmpty()) {
			return false;
		}
		long common = left.stream().filter(right::contains).count();
		return (2.0 * common) / (left.size() + right.size()) >= 0.5;
	}

	private static List<String> bigrams(String value) {
		List<String> grams = new ArrayList<>();
		for (int i = 0; i + 1 < value.length(); i++) {
			grams.add(value.substring(i, i + 2));
		}
		return grams;
	}

	private enum Direction {

		IN, OUT, MOVE

	}

	private static Direction direction(TransactionKind kind) {
		if (kind == TransactionKind.INCOME || kind == TransactionKind.REFUND) {
			return Direction.IN;
		}
		return kind == TransactionKind.TRANSFER ? Direction.MOVE : Direction.OUT;
	}

}
