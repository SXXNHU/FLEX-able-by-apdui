import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  connectionStatus,
  errorMessage,
  onSignedOut,
  refreshAccessToken,
  request,
  setAccessToken,
  setBaseUrlForTests,
} from './client'
import { setTokenStoreForTests, type TokenStore } from './tokenStore'

const cookieStore: TokenStore = {
  client: 'WEB',
  load: async () => null,
  save: async () => {},
  clear: async () => {},
}

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': type },
  })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  setBaseUrlForTests('http://api.test')
  setAccessToken('old-token')
  setTokenStoreForTests(cookieStore)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('API 공통 계층', () => {
  it('Access Token을 붙이고 쿠키를 포함해 보낸다', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }))
    await expect(request('GET', '/api/profile')).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/api/profile')
    expect(init.credentials).toBe('include')
    expect(init.headers.Authorization).toBe('Bearer old-token')
  })

  it('동시에 401을 받아도 토큰 갱신은 한 번만 하고 원래 요청을 다시 보낸다', async () => {
    let refreshes = 0
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshes++
        return json(200, { accessToken: 'new-token', expiresIn: 900, userId: 'u' })
      }
      const auth = (init.headers as Record<string, string>).Authorization
      return auth === 'Bearer new-token' ? json(200, { url }) : json(401, { code: 'unauthorized' })
    })
    const results = await Promise.all([
      request('GET', '/api/a'),
      request('GET', '/api/b'),
      request('GET', '/api/c'),
    ])
    expect(results).toHaveLength(3)
    expect(refreshes).toBe(1)
  })

  it('갱신도 실패하면 로그아웃을 알린다', async () => {
    const signedOut = vi.fn()
    const off = onSignedOut(signedOut)
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/refresh')
        ? json(401, { code: 'invalid_refresh_token' })
        : json(401, { code: 'unauthorized' }),
    )
    await expect(request('GET', '/api/profile')).rejects.toMatchObject({ status: 401 })
    expect(signedOut).toHaveBeenCalledTimes(1)
    off()
  })

  it('네트워크 오류와 서버 준비 중(503)을 연결 상태로 구분한다', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(request('GET', '/api/profile')).rejects.toMatchObject({ status: 0, code: 'network' })
    expect(connectionStatus()).toBe('offline')

    fetchMock.mockResolvedValueOnce(json(503, { code: 'service_unavailable', detail: 'DB 준비 중' }))
    await expect(request('GET', '/api/profile')).rejects.toMatchObject({ status: 503 })
    expect(connectionStatus()).toBe('unavailable')

    fetchMock.mockResolvedValueOnce(json(200, {}))
    await request('GET', '/api/profile')
    expect(connectionStatus()).toBe('online')
  })

  it('ProblemDetail의 코드 · 필드 오류 · 추가 정보를 읽는다', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        422,
        { code: 'duplicate_requires_confirmation', detail: '확인해주세요.', items: ['a'] },
        'application/problem+json',
      ),
    )
    const error = (await request('POST', '/api/transactions/import', {}).catch((e) => e)) as ApiError
    expect(error.code).toBe('duplicate_requires_confirmation')
    expect(error.extra.items).toEqual(['a'])

    fetchMock.mockResolvedValueOnce(
      json(400, {
        code: 'validation_failed',
        detail: '입력값을 확인해주세요.',
        fields: { amount: '금액은 1원 이상이어야 해요.' },
      }),
    )
    const invalid = await request('POST', '/api/transactions', {}).catch((e) => e)
    expect(errorMessage(invalid)).toBe('입력값을 확인해주세요. 금액은 1원 이상이어야 해요.')
  })

  it('본문 없는 응답(204)을 처리한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(request('DELETE', '/api/plans/x')).resolves.toBeUndefined()
  })
})

describe('앱(NATIVE) 토큰 저장', () => {
  it('보안 저장소의 Refresh Token을 본문으로 보내고 새 값으로 바꿔 넣는다', async () => {
    let stored: string | null = 'refresh-1'
    setTokenStoreForTests({
      client: 'NATIVE',
      load: async () => stored,
      save: async (t) => {
        stored = t
      },
      clear: async () => {
        stored = null
      },
    })
    setAccessToken(null)
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        expect(JSON.parse(init.body as string)).toEqual({ client: 'NATIVE', refreshToken: 'refresh-1' })
        return json(200, { accessToken: 'a2', expiresIn: 900, userId: 'u', refreshToken: 'refresh-2' })
      }
      return json(200, {})
    })
    await expect(refreshAccessToken()).resolves.toBe(true)
    expect(stored).toBe('refresh-2')
  })

  it('저장된 토큰이 없으면 서버에 묻지 않고, 거절되면 저장소를 비운다', async () => {
    let stored: string | null = null
    setTokenStoreForTests({
      client: 'NATIVE',
      load: async () => stored,
      save: async (t) => {
        stored = t
      },
      clear: async () => {
        stored = null
      },
    })
    await expect(refreshAccessToken()).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    stored = 'revoked'
    fetchMock.mockResolvedValue(json(401, { code: 'invalid_refresh_token' }))
    await expect(refreshAccessToken()).resolves.toBe(false)
    expect(stored).toBeNull()
  })
})
