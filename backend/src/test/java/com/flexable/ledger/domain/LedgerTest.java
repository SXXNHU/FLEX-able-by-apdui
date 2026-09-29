package com.flexable.ledger.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.flexable.common.error.BusinessRuleException;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@code src/domain.test.ts}의 예산 규칙 시나리오를 같은 값으로 옮긴 테스트. 두 구현의 결과가 같아야 한다.
 */
class LedgerTest {

	static final LocalDate TODAY = LocalDate.parse("2026-09-29");

	/** emptyState(today) + 잔액 30만 원: 수입일은 10일 뒤, 추적은 어제부터 */
	static Ledger base() {
		return new Ledger(new LedgerProfile(300_000, 0, 0, TODAY.plusDays(10), TODAY.minusDays(1)), List.of(),
				List.of(), List.of(), Set.of());
	}

	static Ledger withProfile(Ledger l, LedgerProfile p) {
		return new Ledger(p, l.fixed(), l.plans(), l.transactions(), l.reconciledDates());
	}

	static Ledger withPlans(Ledger l, PlanItem... plans) {
		return new Ledger(l.profile(), l.fixed(), List.of(plans), l.transactions(), l.reconciledDates());
	}

	static PlanItem date(LocalDate date, boolean confirmed) {
		return new PlanItem("date", "데이트", 80_000, date, Category.SOCIAL, confirmed);
	}

	static Ledger planned() {
		return withPlans(base(), date(LocalDate.parse("2026-10-03"), true));
	}

	static Tx tx() {
		return new Tx();
	}

	/** 테스트용 거래 빌더: 기본값은 오늘 현금 점심 1만 원 */
	static final class Tx {

		String id = UUID.randomUUID().toString();

		long amount = 10_000;

		LocalDate date = TODAY;

		TransactionKind kind = TransactionKind.EXPENSE;

		PaymentMethod method = PaymentMethod.CASH;

		String planId;

		String fixedId;

		String refundOf;

		boolean closes;

		Tx amount(long v) {
			amount = v;
			return this;
		}

		Tx date(LocalDate v) {
			date = v;
			return this;
		}

		Tx kind(TransactionKind v) {
			kind = v;
			return this;
		}

		Tx card() {
			method = PaymentMethod.CARD;
			return this;
		}

		Tx plan(String v, boolean closesItem) {
			planId = v;
			closes = closesItem;
			return this;
		}

		Tx fixed(String v, boolean closesItem) {
			fixedId = v;
			closes = closesItem;
			return this;
		}

		Tx refundOf(String v) {
			kind = TransactionKind.REFUND;
			refundOf = v;
			return this;
		}

		LedgerTransaction build() {
			return new LedgerTransaction(id, "점심", amount, date, Category.FOOD, kind, method, planId, fixedId, refundOf,
					closes, TransactionSource.MANUAL, null);
		}

	}

	static Ledger add(Ledger l, Tx t) {
		return l.add(t.build(), TODAY).ledger();
	}

	@Nested
	class 일일_예산_계산 {

		@Test
		void 다음_수입일을_제외하고_오늘_포함_10일로_나눈다() {
			assertThat(base().budget(TODAY).days()).isEqualTo(10);
			assertThat(base().budget(TODAY).daily()).isEqualTo(30_000);
		}

		@Test
		void 계획_8만원_확보_후_하루_22000원() {
			assertThat(planned().budget(TODAY).daily()).isEqualTo(22_000);
		}

		@Test
		void 시연_데이터도_하루_22000원() {
			// demoState: 잔액 142만, 카드 22만, 보호 25만, 월세 55만 · 통신 10만, 토요일 계획 8만
			Ledger demo = new Ledger(new LedgerProfile(1_420_000, 220_000, 250_000, TODAY.plusDays(10), TODAY.minusDays(1)),
					List.of(new FixedItem("rent", "월세", 550_000, TODAY.plusDays(3)),
							new FixedItem("phone", "통신 · 구독", 100_000, TODAY.plusDays(6))),
					List.of(date(LocalDate.parse("2026-10-03"), true),
							new PlanItem("monitor", "새 모니터", 300_000, TODAY.plusDays(20), Category.SHOPPING, false)),
					List.of(), Set.of());
			assertThat(demo.budget(TODAY).daily()).isEqualTo(22_000);
		}

		@Test
		void 예정_수입액을_사용_가능액에_더하지_않는다() {
			// 서버 원장은 예정 수입액을 입력으로 받지도 않는다.
			assertThat(base().budget(TODAY).daily()).isEqualTo(30_000);
		}

		@Test
		void 오늘_소비를_이중_차감하지_않는다() {
			Budget b = add(base(), tx()).budget(TODAY);
			assertThat(b.rawRemaining()).isEqualTo(290_000);
			assertThat(b.daily()).isEqualTo(30_000);
			assertThat(b.todayRemaining()).isEqualTo(20_000);
			assertThat(b.generalToday()).isEqualTo(10_000);
		}

		@Test
		void 다음_날_절약한_돈을_남은_9일로_재분배한다() {
			assertThat(add(base(), tx()).budget(TODAY.plusDays(1)).daily()).isEqualTo(290_000 / 9);
		}

		@Test
		void 초과_소비와_전체_구간_부족을_구분한다() {
			Ledger l = add(base(), tx().amount(40_000));
			Budget b = l.budget(TODAY);
			assertThat(b.todayRemaining()).isZero();
			assertThat(b.overToday()).isEqualTo(10_000);
			assertThat(b.shortage()).isZero();
			assertThat(l.budget(TODAY.plusDays(1)).daily()).isEqualTo(260_000 / 9);
		}

		@Test
		void 음수_예산은_0원과_부족액으로_표시한다() {
			Ledger l = withProfile(base(), new LedgerProfile(300_000, 0, 350_000, TODAY.plusDays(10), TODAY.minusDays(1)));
			assertThat(l.budget(TODAY).todayRemaining()).isZero();
			assertThat(l.budget(TODAY).shortage()).isEqualTo(50_000);
		}

		@Test
		void 수입일이_지난_경우_0으로_나누지_않는다() {
			Budget b = withProfile(base(), new LedgerProfile(300_000, 0, 0, TODAY, TODAY.minusDays(1))).budget(TODAY);
			assertThat(b.days()).isZero();
			assertThat(b.daily()).isZero();
			assertThat(b.todayRemaining()).isZero();
		}

		@Test
		void 미확정_또는_다음_구간_계획은_차감하지_않는다() {
			assertThat(withPlans(base(), date(LocalDate.parse("2026-10-03"), false)).budget(TODAY).daily())
				.isEqualTo(30_000);
			assertThat(withPlans(base(), date(TODAY.plusDays(10), true)).budget(TODAY).daily()).isEqualTo(30_000);
		}

		@Test
		void 날짜가_지난_미정산_계획은_계속_확보한다() {
			assertThat(withPlans(base(), date(TODAY.minusDays(1), true)).budget(TODAY).plannedReserve())
				.isEqualTo(80_000);
		}

		@Test
		void 전날_확인이_없으면_잠정_금액이며_자동_무지출_확정하지_않는다() {
			assertThat(base().budget(TODAY).provisional()).isTrue();
			Ledger checked = new Ledger(base().profile(), List.of(), List.of(), List.of(), Set.of(TODAY.minusDays(1)));
			assertThat(checked.budget(TODAY).provisional()).isFalse();
		}

		@Test
		void 어제만_확인해도_이전_미확인_날짜가_남으면_잠정_상태다() {
			Ledger l = new Ledger(new LedgerProfile(300_000, 0, 0, TODAY.plusDays(10), TODAY.minusDays(3)), List.of(),
					List.of(), List.of(), Set.of(TODAY.minusDays(1)));
			assertThat(l.budget(TODAY).pending()).containsExactly(TODAY.minusDays(3), TODAY.minusDays(2));
			assertThat(l.budget(TODAY).provisional()).isTrue();
		}

		@Test
		void 새_거래_추가_후_해당_날짜의_정산_확인을_무효화한다() {
			Ledger checked = new Ledger(base().profile(), List.of(), List.of(), List.of(), Set.of(TODAY));
			assertThat(add(checked, tx()).reconciledDates()).doesNotContain(TODAY);
		}

		@Test
		void 윤년과_연도_경계() {
			Ledger l = new Ledger(new LedgerProfile(0, 0, 0, LocalDate.parse("2028-03-01"), null), List.of(), List.of(),
					List.of(), Set.of());
			assertThat(l.budget(LocalDate.parse("2028-02-28")).days()).isEqualTo(2);
		}

	}

	@Nested
	class 계획과_실제_거래_연결 {

		@Test
		void 계획_8만원을_7만원으로_정산하면_차액_1만원을_돌린다() {
			Ledger l = add(planned(), tx().amount(70_000).plan("date", true));
			Budget b = l.budget(TODAY);
			assertThat(b.plannedReserve()).isZero();
			assertThat(b.rawRemaining()).isEqualTo(230_000);
			assertThat(b.daily()).isEqualTo(23_000);
			assertThat(b.generalToday()).isZero();
			assertThat(l.isClosed("date")).isTrue();
		}

		@Test
		void 부분_결제는_남은_계획_확보액만_줄인다() {
			Ledger l = add(planned(), tx().amount(30_000).plan("date", false));
			assertThat(l.remainingFor(l.plans().getFirst())).isEqualTo(50_000);
			assertThat(l.budget(TODAY).rawRemaining()).isEqualTo(220_000);
		}

		@Test
		void 계획_초과_소비를_숨기지_않는다() {
			Ledger l = add(planned(), tx().amount(100_000).plan("date", true));
			assertThat(l.budget(TODAY).rawRemaining()).isEqualTo(200_000);
			assertThat(l.actualFor("date")).isEqualTo(100_000);
		}

		@Test
		void 정산_거래_삭제_시_잔액과_계획_확보_상태를_되돌린다() {
			Tx t = tx().amount(70_000).plan("date", true);
			Ledger l = add(planned(), t).remove(t.id);
			assertThat(l.profile().balance()).isEqualTo(300_000);
			assertThat(l.budget(TODAY).plannedReserve()).isEqualTo(80_000);
		}

		@Test
		void 계획_취소는_확보액을_돌린다() {
			assertThat(withPlans(planned()).budget(TODAY).rawRemaining()).isEqualTo(300_000);
		}

		@Test
		void 고정지출_납부_시_잔액과_확보액이_동시에_줄어든다() {
			Ledger l = new Ledger(base().profile(), List.of(new FixedItem("rent", "월세", 100_000, TODAY.plusDays(2))),
					List.of(), List.of(), Set.of());
			Ledger paid = add(l, tx().amount(100_000).fixed("rent", true));
			assertThat(paid.budget(TODAY).rawRemaining()).isEqualTo(l.budget(TODAY).rawRemaining());
			assertThat(paid.budget(TODAY).fixedReserve()).isZero();
		}

		@Test
		void 개인화_금액_제안은_정산된_실제_계획만_사용한다() {
			assertThat(planned().estimate(Category.SOCIAL)).isEmpty();
			Ledger l = add(planned(), tx().amount(70_000).plan("date", true));
			assertThat(l.estimate(Category.SOCIAL)).contains(new Estimate(70_000, 70_000, 70_000, 1));
		}

		@Test
		void 미확정_계획에는_거래를_연결할_수_없다() {
			Ledger draft = withPlans(base(), date(TODAY, false));
			assertThatThrownBy(() -> add(draft, tx().plan("date", true))).isInstanceOf(BusinessRuleException.class)
				.hasMessageContaining("확정된");
		}

	}

	@Nested
	class 카드_이체_환불 {

		@Test
		void 카드_소비는_잔액_대신_미결제액으로_확보한다() {
			Ledger l = add(base(), tx().card());
			assertThat(l.profile().balance()).isEqualTo(300_000);
			assertThat(l.profile().cardOutstanding()).isEqualTo(10_000);
			assertThat(l.budget(TODAY).todayRemaining()).isEqualTo(20_000);
		}

		@Test
		void 카드대금_납부가_두_번째_소비가_되지_않는다() {
			Ledger spent = add(base(), tx().card());
			Ledger paid = add(spent, tx().kind(TransactionKind.CARD_PAYMENT));
			assertThat(paid.profile().balance()).isEqualTo(290_000);
			assertThat(paid.profile().cardOutstanding()).isZero();
			assertThat(paid.budget(TODAY).rawRemaining()).isEqualTo(spent.budget(TODAY).rawRemaining());
		}

		@Test
		void 확보된_카드액보다_큰_납부는_거절한다() {
			assertThatThrownBy(() -> add(base(), tx().kind(TransactionKind.CARD_PAYMENT)))
				.hasMessageContaining("미결제");
		}

		@Test
		void 내_계좌_이체는_잔액과_소비에_영향을_주지_않는다() {
			Budget b = add(base(), tx().kind(TransactionKind.TRANSFER)).budget(TODAY);
			assertThat(b.rawRemaining()).isEqualTo(300_000);
			assertThat(b.generalToday()).isZero();
		}

		@Test
		void 환불은_원거래의_결제_방법을_따르고_누적_한도를_지킨다() {
			Tx original = tx().card();
			Ledger l = add(add(base(), original), tx().refundOf(original.id).amount(6_000));
			assertThat(l.profile().cardOutstanding()).isEqualTo(4_000);
			assertThat(l.profile().balance()).isEqualTo(300_000);
			assertThatThrownBy(() -> add(l, tx().refundOf(original.id).amount(5_000))).hasMessageContaining("원거래");
		}

		@Test
		void 환불된_원거래는_바로_삭제할_수_없다() {
			Tx original = tx();
			Ledger l = add(add(base(), original), tx().refundOf(original.id));
			assertThatThrownBy(() -> l.remove(original.id)).hasMessageContaining("환불");
		}

		@Test
		void 계획_환불은_원거래_연결을_유지한다() {
			Tx original = tx().amount(70_000).plan("date", true);
			Ledger l = add(add(planned(), original), tx().refundOf(original.id).amount(10_000));
			assertThat(l.transactions().getFirst().planId()).isEqualTo("date");
			assertThat(l.budget(TODAY).generalToday()).isZero();
			assertThat(l.budget(TODAY).rawRemaining()).isEqualTo(240_000);
			assertThat(l.actualFor("date")).isEqualTo(60_000);
		}

		@Test
		void 음수_0원_미래_날짜_거래는_거절한다() {
			assertThatThrownBy(() -> add(base(), tx().amount(-1))).isInstanceOf(BusinessRuleException.class);
			assertThatThrownBy(() -> add(base(), tx().amount(0))).isInstanceOf(BusinessRuleException.class);
			assertThatThrownBy(() -> add(base(), tx().date(TODAY.plusDays(1)))).isInstanceOf(BusinessRuleException.class);
		}

		@Test
		void 같은_ID는_두_번_반영하지_않는다() {
			Tx t = tx();
			Ledger l = add(base(), t);
			assertThatThrownBy(() -> add(l, t)).hasMessageContaining("이미 반영된");
		}

	}

}
