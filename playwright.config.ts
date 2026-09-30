import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E는 실제 백엔드 · MySQL과 함께 돌린다.
 * - DB: 로컬은 docker compose(별도 프로젝트, 13306 포트). CI는 서비스 컨테이너를 쓰므로 E2E_EXTERNAL_DB=1.
 * - 백엔드: readiness가 UP(DB 연결 + 스키마 준비)이 될 때까지 기다린다. DB보다 먼저 떠도 괜찮다.
 * - 프론트: VITE_API_BASE_URL로 백엔드 주소를 받는다.
 */
const dbPort = process.env.E2E_DB_PORT || '13306'
const apiPort = process.env.E2E_API_PORT || '18080'
const gradle = `"${resolve('backend', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}"`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    ...(process.env.E2E_EXTERNAL_DB
      ? []
      : [
          {
            command: 'docker compose -p flexable-e2e up db',
            port: Number(dbPort),
            env: { DB_PORT: dbPort },
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]),
    {
      command: `${gradle} bootRun --quiet`,
      cwd: 'backend',
      url: `http://localhost:${apiPort}/actuator/health/readiness`,
      env: {
        SERVER_PORT: apiPort,
        DB_URL: `jdbc:mysql://localhost:${dbPort}/flexable?serverTimezone=Asia/Seoul&characterEncoding=UTF-8`,
        DB_USERNAME: 'flexable',
        DB_PASSWORD: 'flexable',
        CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
        // 테스트 전용 고정 키 (운영에서 쓰지 않음)
        AUTH_JWT_SECRET: 'ZTJlLXRlc3Qtc2VjcmV0LWtleS1mb3ItZmxleGFibGUtMzJi',
        AUTH_GUEST_LIMIT_PER_HOUR: '10000',
        SCHEMA_RETRY_INITIAL_DELAY: '500ms',
        SCHEMA_RETRY_MAX_DELAY: '3s',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      env: { VITE_API_BASE_URL: `http://localhost:${apiPort}` },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
