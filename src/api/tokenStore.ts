import { FlexNative, isNative } from '../native'

/**
 * Refresh Token 보관 방식. 서버의 client 값과 짝을 이룬다.
 * - WEB: 서버가 HttpOnly 쿠키로 주고받으므로 스크립트는 토큰을 다루지 않는다.
 * - NATIVE: 응답 본문으로 받아 Android Keystore로 암호화한 저장소에 둔다. localStorage에는 두지 않는다.
 */
export interface TokenStore {
  client: 'WEB' | 'NATIVE'
  load(): Promise<string | null>
  save(token: string): Promise<void>
  clear(): Promise<void>
}

const KEY = 'refresh_token'

const cookieStore: TokenStore = {
  client: 'WEB',
  load: async () => null,
  save: async () => {},
  clear: async () => {},
}

const nativeStore: TokenStore = {
  client: 'NATIVE',
  load: async () => (await FlexNative.secureGet({ key: KEY })).value,
  save: (token) => FlexNative.secureSet({ key: KEY, value: token }),
  clear: () => FlexNative.secureRemove({ key: KEY }),
}

export let tokenStore: TokenStore = isNative ? nativeStore : cookieStore

export function setTokenStoreForTests(store: TokenStore) {
  tokenStore = store
}
