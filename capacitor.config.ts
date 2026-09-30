import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android 앱은 빌드된 웹 앱(dist)을 WebView(https://localhost)에서 연다.
 * API 주소는 빌드할 때 VITE_API_BASE_URL로 넣는다 (예: 에뮬레이터에서 PC의 백엔드 → http://10.0.2.2:8080).
 */
const config: CapacitorConfig = {
  appId: 'com.flexable.app',
  appName: 'flex-able',
  webDir: 'dist',
  android: {
    // 개발 중 http 백엔드(에뮬레이터의 10.0.2.2 등)를 호출할 수 있게 한다. 운영 API는 https를 쓴다.
    allowMixedContent: process.env.CAP_ALLOW_HTTP === '1',
  },
}

export default config
