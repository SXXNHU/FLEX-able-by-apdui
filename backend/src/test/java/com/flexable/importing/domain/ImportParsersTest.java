package com.flexable.importing.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.flexable.importing.domain.NotificationParser.RawNotification;
import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.LedgerTransaction;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;
import com.flexable.ledger.domain.TransactionSource;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** {@code src/imports.test.ts}와 캡처 시나리오를 같은 값으로 옮긴 테스트 */
class ImportParsersTest {

	static final LocalDate TODAY = LocalDate.parse("2026-09-29");

	static final LocalDate SEP_28 = LocalDate.parse("2026-09-28");

	static LedgerTransaction existing(String title, long amount, LocalDate date) {
		return new LedgerTransaction("t1", title, amount, date, Category.CAFE, TransactionKind.EXPENSE,
				PaymentMethod.CASH, null, null, null, false, TransactionSource.CAPTURE, null);
	}

	static RawNotification noti(String title, String text) {
		return new RawNotification("k1", "test.app", title, text, null,
				OffsetDateTime.parse("2026-09-28T12:40:00+09:00").toInstant().toEpochMilli());
	}

	static ImportedRow row(String title, long amount, LocalDate date, TransactionKind kind, Category category) {
		return new ImportedRow(title, amount, date, kind, PaymentMethod.CASH, category, null);
	}

	@Nested
	class 출처가_다른_같은_결제_찾기 {

		@Test
		void 같은_날짜_금액_이름은_확실한_중복() {
			var found = DuplicateFinder.find(List.of(existing("동네 커피", 4500, SEP_28)), "동네커피", 4500, SEP_28,
					TransactionKind.EXPENSE);
			assertThat(found.getFirst().level()).isEqualTo(DuplicateFinder.Level.EXACT);
		}

		@Test
		void 가맹점_표기가_달라도_같은_날_같은_금액이면_확인_대상() {
			var found = DuplicateFinder.find(List.of(existing("스타벅스 강남점", 4500, SEP_28)), "스타벅스코리아", 4500, SEP_28,
					TransactionKind.EXPENSE);
			assertThat(found).hasSize(1);
			assertThat(found.getFirst().level()).isEqualTo(DuplicateFinder.Level.LIKELY);
		}

		@Test
		void 하루_차이는_이름이_비슷할_때만_확인_대상() {
			var list = List.of(existing("스타벅스 강남점", 4500, SEP_28));
			assertThat(DuplicateFinder.find(list, "스타벅스", 4500, TODAY, TransactionKind.EXPENSE)).hasSize(1);
			assertThat(DuplicateFinder.find(list, "김밥천국", 4500, TODAY, TransactionKind.EXPENSE)).isEmpty();
		}

		@Test
		void 금액이_다르거나_입금과_지출이면_중복이_아님() {
			var list = List.of(existing("스타벅스", 4500, SEP_28));
			assertThat(DuplicateFinder.find(list, "스타벅스", 4600, SEP_28, TransactionKind.EXPENSE)).isEmpty();
			assertThat(DuplicateFinder.find(list, "스타벅스", 4500, SEP_28, TransactionKind.INCOME)).isEmpty();
		}

	}

	@Nested
	class CSV_가져오기 {

		@Test
		void 따옴표_안의_쉼표와_줄바꿈을_한_칸으로_읽는다() {
			assertThat(CsvImport.parse("a,\"1,000원\",\"x\ny\"\r\nb,2,3"))
				.containsExactly(List.of("a", "1,000원", "x\ny"), List.of("b", "2", "3"));
		}

		@Test
		void 은행_내보내기_안내_문구_아래_머리행과_출금_입금_열() {
			var table = CsvImport.parse(String.join("\n", "거래내역 조회,,,,", "계좌번호,123-456,,,",
					"거래일시,적요,출금액,입금액,잔액", "2026.09.28 12:30:11,스타벅스,\"4,500\",0,\"995,500\"",
					"2026.09.27 09:00:00,급여,0,\"2,800,000\",\"1,000,000\"", "2026.09.30 09:00:00,미래 거래,\"1,000\",0,0"));
			var mapping = CsvImport.detect(table).orElseThrow();
			assertThat(mapping.headerRow()).isEqualTo(2);
			var result = CsvImport.rows(table, mapping, TODAY, PaymentMethod.CASH);
			assertThat(result.rows()).containsExactly(
					row("스타벅스", 4500, SEP_28, TransactionKind.EXPENSE, Category.CAFE),
					row("급여", 2_800_000, LocalDate.parse("2026-09-27"), TransactionKind.INCOME, Category.ETC));
			assertThat(result.skipped()).isEqualTo(1);
		}

		@Test
		void 카드_이용내역_금액_한_열_승인취소_행_제외() {
			var table = CsvImport
				.parse("이용일자,이용하신곳,이용금액,승인구분\n2026-09-28,김밥천국,8000,승인\n2026-09-28,쿠팡,12000,승인취소");
			var mapping = CsvImport.detect(table).orElseThrow();
			assertThat(CsvImport.looksLikeCreditCard(table, mapping)).isTrue();
			var result = CsvImport.rows(table, mapping, TODAY, PaymentMethod.CARD);
			assertThat(result.rows()).containsExactly(new ImportedRow("김밥천국", 8000, SEP_28, TransactionKind.EXPENSE,
					PaymentMethod.CARD, Category.FOOD, null));
			assertThat(result.skipped()).isEqualTo(1);
		}

		@Test
		void 부호_있는_거래금액은_음수를_지출_양수를_입금으로_본다() {
			var table = CsvImport.parse("거래 일시,내용,거래 금액\n2026.09.28 10:00,택시,-12000\n2026.09.28 11:00,환급,3000");
			assertThat(CsvImport.rows(table, CsvImport.detect(table).orElseThrow(), TODAY, PaymentMethod.CASH)
				.rows()
				.stream()
				.map(ImportedRow::kind)).containsExactly(TransactionKind.EXPENSE, TransactionKind.INCOME);
		}

		@Test
		void 여러_날짜_표기() {
			assertThat(CsvImport.parseLooseDate("20260928", "2026")).contains(SEP_28);
			assertThat(CsvImport.parseLooseDate("26.09.28", "2026")).contains(SEP_28);
			assertThat(CsvImport.parseLooseDate("09/28", "2026")).contains(SEP_28);
			assertThat(CsvImport.parseLooseDate("46293", "2026")).contains(SEP_28);
			assertThat(CsvImport.parseLooseDate("2026.02.30", "2026")).isEmpty();
		}

		@Test
		void 머리행을_찾지_못하면_빈_값() {
			assertThat(CsvImport.detect(CsvImport.parse("a,b\n1,2"))).isEmpty();
		}

	}

	@Nested
	class 결제_알림_해석 {

		@Test
		void 신용카드_승인_문자() {
			assertThat(NotificationParser
				.parse(noti("", "[Web발신]\n신한카드(1234)승인 홍*동 12,500원(일시불)09/28 12:34 스타벅스 누적1,234,567원")))
				.contains(new ImportedRow("스타벅스", 12500, SEP_28, TransactionKind.EXPENSE, PaymentMethod.CARD,
						Category.CAFE, "noti:k1"));
		}

		@Test
		void 줄_단위_카드_알림() {
			var parsed = NotificationParser
				.parse(noti("KB국민카드", "KB국민카드1234승인\n홍*동님\n8,000원 일시불\n09/27 19:02\n김밥천국\n누적 300,000원"))
				.orElseThrow();
			assertThat(parsed.title()).isEqualTo("김밥천국");
			assertThat(parsed.amount()).isEqualTo(8000);
			assertThat(parsed.date()).isEqualTo(LocalDate.parse("2026-09-27"));
			assertThat(parsed.method()).isEqualTo(PaymentMethod.CARD);
			assertThat(parsed.category()).isEqualTo(Category.FOOD);
		}

		@Test
		void 체크카드와_은행_출금은_계좌_결제() {
			var bank = NotificationParser.parse(noti("출금 12,500원", "카카오T 택시 | 잔액 100,000원")).orElseThrow();
			assertThat(bank.title()).isEqualTo("카카오T 택시");
			assertThat(bank.method()).isEqualTo(PaymentMethod.CASH);
			assertThat(bank.category()).isEqualTo(Category.TRANSPORT);
			var check = NotificationParser.parse(noti("", "우리체크카드 승인 4,500원 09/28 08:10 이디야커피")).orElseThrow();
			assertThat(check.method()).isEqualTo(PaymentMethod.CASH);
			assertThat(check.title()).isEqualTo("이디야커피");
		}

		@Test
		void 입금_알림은_수입() {
			var income = NotificationParser.parse(noti("입금 2,800,000원", "(주)플렉스 | 잔액 3,000,000원")).orElseThrow();
			assertThat(income.kind()).isEqualTo(TransactionKind.INCOME);
			assertThat(income.amount()).isEqualTo(2_800_000);
		}

		@Test
		void 광고_취소_인증번호_금액_없는_알림은_무시() {
			assertThat(NotificationParser.parse(noti("(광고) 이벤트", "결제 시 5,000원 할인"))).isEmpty();
			assertThat(NotificationParser.parse(noti("", "신한카드 승인취소 12,500원 스타벅스"))).isEmpty();
			assertThat(NotificationParser.parse(noti("", "인증번호 [123456]"))).isEmpty();
			assertThat(NotificationParser.parse(noti("친구", "저녁 먹었어?"))).isEmpty();
		}

		@Test
		void 연초에_받은_12월_거래는_작년_날짜() {
			var n = new RawNotification("k2", "test.app", "", "삼성카드 승인 10,000원 12/31 23:50 편의점", null,
					OffsetDateTime.parse("2027-01-01T00:10:00+09:00").toInstant().toEpochMilli());
			assertThat(NotificationParser.parse(n).orElseThrow().date()).isEqualTo(LocalDate.parse("2026-12-31"));
		}

		@Test
		void 펼친_본문이_있으면_그것을_읽는다() {
			var n = new RawNotification("k3", "test.app", "현대카드", "현대카드 승인...", "현대카드 승인 7,000원 09/28 13:00 김밥천국",
					OffsetDateTime.parse("2026-09-28T13:00:00+09:00").toInstant().toEpochMilli());
			assertThat(NotificationParser.parse(n).orElseThrow().amount()).isEqualTo(7000);
		}

	}

	@Test
	void 캡처_문자에서_날짜와_거래_후보를_추출하며_잔액은_제외한다() {
		assertThat(CaptureText.parse("2026.09.28\n동네 커피 4,500원\n잔액 200,000원\n점심\n9,000원", TODAY))
			.extracting(ImportedRow::title, ImportedRow::amount, ImportedRow::date)
			.containsExactly(org.assertj.core.groups.Tuple.tuple("동네 커피", 4500L, SEP_28),
					org.assertj.core.groups.Tuple.tuple("점심", 9000L, SEP_28));
	}

	@Test
	void 가맹점으로_카테고리_추측() {
		assertThat(CategoryGuesser.guess("메가박스 코엑스")).isEqualTo(Category.CULTURE);
		assertThat(CategoryGuesser.guess("메가커피 역삼")).isEqualTo(Category.CAFE);
		assertThat(CategoryGuesser.guess("알 수 없음")).isEqualTo(Category.ETC);
	}

}
