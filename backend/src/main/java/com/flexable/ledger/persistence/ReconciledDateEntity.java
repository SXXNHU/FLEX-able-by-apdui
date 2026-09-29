package com.flexable.ledger.persistence;

import java.io.Serializable;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** 사용자가 "빠진 거래 없음"을 확인한 날짜 */
@Entity
@Table(name = "reconciled_dates")
public class ReconciledDateEntity {

	@Embeddable
	public record Key(@Column(name = "user_id", length = 36) String userId, @Column(name = "day") LocalDate day)
			implements Serializable {
	}

	@EmbeddedId
	private Key key;

	protected ReconciledDateEntity() {
	}

	public ReconciledDateEntity(String userId, LocalDate day) {
		this.key = new Key(userId, day);
	}

	public LocalDate getDay() {
		return key.day();
	}

}
