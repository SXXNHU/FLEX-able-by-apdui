package com.flexable.common.schema;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

/** readiness 그룹에 포함되어 스키마 마이그레이션 전에는 트래픽을 받지 않게 한다. */
@Component("schema")
public class SchemaHealthIndicator implements HealthIndicator {

	private final SchemaMigrator migrator;

	SchemaHealthIndicator(SchemaMigrator migrator) {
		this.migrator = migrator;
	}

	@Override
	public Health health() {
		if (migrator.isReady()) {
			return Health.up().build();
		}
		return Health.outOfService()
			.withDetail("status", migrator.status())
			.withDetail("error", migrator.lastError())
			.build();
	}

}
