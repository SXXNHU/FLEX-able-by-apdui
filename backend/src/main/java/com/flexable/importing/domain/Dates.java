package com.flexable.importing.domain;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.Optional;

final class Dates {

	private Dates() {
	}

	/** 존재하는 날짜만 (2월 30일 같은 값은 비움) */
	static Optional<LocalDate> of(String year, String month, String day) {
		try {
			return Optional.of(LocalDate.of(Integer.parseInt(year), Integer.parseInt(month), Integer.parseInt(day)));
		}
		catch (DateTimeException | NumberFormatException ex) {
			return Optional.empty();
		}
	}

}
