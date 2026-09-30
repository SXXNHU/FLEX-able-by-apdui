/**
 * 모든 서버 호출이 거치는 공통 계층. 주소 결정, 타임아웃, 오류 형식(ProblemDetail), 연결 상태, 토큰 갱신을 여기서만 다룬다.
 * UI 컴포넌트는 fetch를 직접 부르지 않는다.
 */

export type ConnectionStatus = 'online' | 'offline' | 'unavailable'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 10_000

let baseUrl: string | null = null
let accessToken: string | null = null
let status: ConnectionStatus = 'online'
let refreshing: Promise<boolean> | null = null
const statusListeners = new Set<(s: ConnectionStatus) => void>()
const signedOutListeners = new Set<() => void>()

/**
 * API 주소: 배포 시 주입하는 /config.json → 빌드 환경변수 VITE_API_BASE_URL → 같은 호스트의 8080 포트.
 * 프론트와 백엔드를 따로 배포해도 다시 빌드하지 않고 주소만 바꿀 수 있다.
 */
export async function loadConfig(): Promise<string> {
  if (baseUrl) return baseUrl
  let configured = ''
  try {
    const response = await fetch('/config.json', { cache: 'no-store' })
    if (response.ok && response.headers.get('content-type')?.includes('json')) {
      configured = ((await response.json()) as { apiBaseUrl?: string }).apiBaseUrl || ''
    }
  } catch {
    // 설정 파일이 없으면 다음 후보를 쓴다.
  }
  baseUrl = (
    configured ||
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    `${location.protocol}//${location.hostname}:8080`
  ).replace(/\/$/, '')
  return baseUrl
}

export function setBaseUrlForTests(url: string) {
  baseUrl = url
}

/** Access Token은 메모리에만 둔다. 새로고침하면 Refresh 쿠키로 다시 받는다. */
export function setAccessToken(token: string | null) {
  accessToken = token
}

export function connectionStatus() {
  return status
}

export function onConnectionChange(listener: (s: ConnectionStatus) => void) {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

/** 토큰 갱신이 실패해 다시 로그인해야 할 때 */
export function onSignedOut(listener: () => void) {
  signedOutListeners.add(listener)
  return () => {
    signedOutListeners.delete(listener)
  }
}

function setStatus(next: ConnectionStatus) {
  if (next === status) return
  status = next
  statusListeners.forEach((l) => l(next))
}

type Options = { auth?: boolean; retryOn401?: boolean }

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: Options = {},
): Promise<T> {
  const { auth = true, retryOn401 = true } = options
  const base = await loadConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, application/problem+json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    setStatus('offline')
    throw new ApiError(0, 'network', '서버에 연결할 수 없어요. 네트워크를 확인하고 다시 시도해주세요.')
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401 && auth && retryOn401) {
    if (await refreshAccessToken()) return request<T>(method, path, body, { auth, retryOn401: false })
    signedOutListeners.forEach((l) => l())
  }
  if (response.status === 503) setStatus('unavailable')
  else if (response.status < 500) setStatus('online')
  if (response.ok) {
    if (response.status === 204) return undefined as T
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
  throw await toError(response)
}

async function toError(response: Response): Promise<ApiError> {
  let problem: Record<string, unknown> = {}
  try {
    problem = (await response.json()) as Record<string, unknown>
  } catch {
    // 본문이 없거나 JSON이 아닌 오류 (프록시 등)
  }
  const { code, detail, fields, status: _s, title: _t, type: _ty, instance: _i, ...extra } = problem
  const fallback =
    response.status === 503
      ? '서버가 잠시 준비 중이에요. 조금 뒤 다시 시도해주세요.'
      : response.status >= 500
        ? '서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
        : '요청을 처리하지 못했어요.'
  return new ApiError(
    response.status,
    typeof code === 'string' ? code : `http_${response.status}`,
    typeof detail === 'string' ? detail : fallback,
    (fields as Record<string, string>) || {},
    extra,
  )
}

export type TokenResponse = { accessToken: string; expiresIn: number; userId: string }

/**
 * Refresh 쿠키로 새 Access Token을 받는다. 동시에 여러 요청이 401을 받아도 갱신은 한 번만 한다.
 * (같은 Refresh Token을 두 번 쓰면 서버가 탈취로 보고 로그인을 끊는다.)
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= request<TokenResponse>('POST', '/api/auth/refresh', { client: 'WEB' }, { auth: false })
    .then((t) => {
      setAccessToken(t.accessToken)
      return true
    })
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 0) throw e
      setAccessToken(null)
      return false
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** 사용자에게 보여줄 오류 문장 */
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const firstField = Object.values(error.fields)[0]
    return firstField ? `${error.message} ${firstField}` : error.message
  }
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.'
}
