package com.flexable.importing.domain;

import java.time.LocalDate;

import com.flexable.ledger.domain.Category;
import com.flexable.ledger.domain.PaymentMethod;
import com.flexable.ledger.domain.TransactionKind;

/**
 * 외부 원문(CSV, 캡처 문자, 결제 알림)에서 읽어낸 거래 후보. 사용자 확인 또는 중복 검사를 거쳐야 거래가 된다.
 *
 * @param sourceEventId 같은 원문이 다시 들어와도 한 번만 반영하기 위한 외부 식별자 (없으면 null)
 */
public record ImportedRow(String title, long amount, LocalDate date, TransactionKind kind, PaymentMethod method,
		Category category, String sourceEventId) {

}
