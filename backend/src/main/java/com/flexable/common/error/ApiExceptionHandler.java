package com.flexable.common.error;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

import org.hibernate.exception.JDBCConnectionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 모든 오류를 RFC 9457 ProblemDetail로 응답한다. 클라이언트는 {@code code}로 분기하고 {@code detail}은 그대로
 * 사용자에게 보여줄 수 있다.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	static final String RETRY_AFTER_SECONDS = "5";

	@ExceptionHandler(BusinessRuleException.class)
	ProblemDetail businessRule(BusinessRuleException ex) {
		return problem(HttpStatus.UNPROCESSABLE_CONTENT, ex.code(), ex.getMessage());
	}

	@ExceptionHandler(ConflictException.class)
	ProblemDetail conflict(ConflictException ex) {
		return problem(HttpStatus.CONFLICT, "conflict", ex.getMessage());
	}

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail notFound(NotFoundException ex) {
		return problem(HttpStatus.NOT_FOUND, "not_found", ex.getMessage());
	}

	/** DB 미준비 · 연결 실패는 일시적 장애이므로 503과 Retry-After로 알린다. */
	@ExceptionHandler({ ServiceUnavailableException.class, CannotCreateTransactionException.class,
			DataAccessResourceFailureException.class, JDBCConnectionException.class })
	ResponseEntity<ProblemDetail> unavailable(Exception ex) {
		log.warn("Database unavailable: {}", ex.getMessage());
		String message = (ex instanceof ServiceUnavailableException) ? ex.getMessage()
				: "데이터베이스에 연결할 수 없어요. 잠시 후 다시 시도해주세요.";
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.header(HttpHeaders.RETRY_AFTER, RETRY_AFTER_SECONDS)
			.body(problem(HttpStatus.SERVICE_UNAVAILABLE, "service_unavailable", message));
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> fields = new LinkedHashMap<>();
		ex.getBindingResult()
			.getFieldErrors()
			.forEach((error) -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
		ProblemDetail body = problem(HttpStatus.BAD_REQUEST, "validation_failed", "입력값을 확인해주세요.");
		body.setProperty("fields", fields);
		return ResponseEntity.badRequest().body(body);
	}

	@Override
	protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		return ResponseEntity.badRequest()
			.body(problem(HttpStatus.BAD_REQUEST, "malformed_request", "요청 형식을 읽을 수 없어요. 값의 형식을 확인해주세요."));
	}

	@ExceptionHandler(Exception.class)
	ProblemDetail unexpected(Exception ex) {
		log.error("Unexpected error", ex);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "요청을 처리하지 못했어요.");
	}

	static ProblemDetail problem(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setType(URI.create("https://flex-able.app/problems/" + code));
		problem.setProperty("code", code);
		return problem;
	}

}
