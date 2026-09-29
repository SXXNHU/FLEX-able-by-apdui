package com.flexable.common.schema;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import javax.sql.DataSource;

import com.flexable.common.config.AppProperties;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Flyway 마이그레이션을 부팅과 분리해 백그라운드에서 재시도한다.
 *
 * <p>
 * Spring 기본 Flyway 연동은 시작 시점에 DB가 없으면 애플리케이션 기동 자체를 실패시킨다. 여기서는 프로세스를
 * 살려 두고(liveness UP) 스키마가 준비될 때까지 readiness를 DOWN으로 유지한다. 연결 복구 자체는 HikariCP가
 * 담당하므로 별도 커넥션 관리는 하지 않는다.
 */
@Component
public class SchemaMigrator {

	private static final Logger log = LoggerFactory.getLogger(SchemaMigrator.class);

	public enum Status {

		PENDING, READY

	}

	private final DataSource dataSource;

	private final Duration initialDelay;

	private final Duration maxDelay;

	private final AtomicReference<Status> status = new AtomicReference<>(Status.PENDING);

	private final AtomicReference<String> lastError = new AtomicReference<>("");

	private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor((r) -> {
		Thread thread = new Thread(r, "schema-migrator");
		thread.setDaemon(true);
		return thread;
	});

	public SchemaMigrator(DataSource dataSource, AppProperties properties) {
		this.dataSource = dataSource;
		this.initialDelay = properties.schema().retryInitialDelay();
		this.maxDelay = properties.schema().retryMaxDelay();
	}

	@EventListener(ApplicationReadyEvent.class)
	void start() {
		executor.execute(() -> attempt(initialDelay));
	}

	private void attempt(Duration delay) {
		try {
			Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
			status.set(Status.READY);
			lastError.set("");
			executor.shutdown();
			log.info("Database schema is ready");
		}
		catch (RuntimeException ex) {
			lastError.set(rootMessage(ex));
			Duration doubled = delay.multipliedBy(2);
			Duration next = doubled.compareTo(maxDelay) > 0 ? maxDelay : doubled;
			log.warn("Database not ready ({}). Retrying schema migration in {} ms", lastError.get(), delay.toMillis());
			executor.schedule(() -> attempt(next), delay.toMillis(), TimeUnit.MILLISECONDS);
		}
	}

	private static String rootMessage(Throwable ex) {
		Throwable root = ex;
		while (root.getCause() != null && root.getCause() != root) {
			root = root.getCause();
		}
		return root.getClass().getSimpleName() + ": " + root.getMessage();
	}

	public boolean isReady() {
		return status.get() == Status.READY;
	}

	public Status status() {
		return status.get();
	}

	public String lastError() {
		return lastError.get();
	}

}
