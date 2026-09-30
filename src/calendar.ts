import { addDays, type Plan } from './domain'
import { FlexNative, isNative } from './native'

/**
 * 캘린더 연동. 가져온 일정은 모두 금액 없는 미확정 계획이 되고, 사용자가 금액을 확인한 뒤 확정한다.
 * - Android 앱: 기기 캘린더 (기기에 동기화된 Google 계정 캘린더 포함)
 * - 웹: Google Calendar API (VITE_GOOGLE_CLIENT_ID가 있을 때, 읽기 전용 권한)
 * - 공통: .ics 파일
 */
export type CalendarEvent = { title: string; date: string }

export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''
export const deviceCalendarAvailable = isNative
export const googleCalendarAvailable = !isNative && !!googleClientId

/** 오늘부터 기간 안의 기기 캘린더 일정. 처음 부르면 캘린더 읽기 권한을 묻는다. */
export async function deviceEvents(from: string, days = 60): Promise<CalendarEvent[]> {
  const { events } = await FlexNative.listCalendarEvents({ from, to: addDays(from, days) })
  return events.map((e) => ({ title: e.title, date: e.date }))
}

/* ───────── Google Calendar (웹) ───────── */

type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void }
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: { access_token?: string; error?: string }) => void
        error_callback?: (error: { type: string }) => void
      }) => TokenClient
    }
  }
}

let gisLoading: Promise<GoogleIdentity> | null = null
function loadGoogleIdentity(): Promise<GoogleIdentity> {
  gisLoading ??= new Promise((resolve, reject) => {
    const existing = (window as unknown as { google?: GoogleIdentity }).google
    if (existing?.accounts) return resolve(existing)
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve((window as unknown as { google: GoogleIdentity }).google)
    script.onerror = () => {
      gisLoading = null
      reject(new Error('Google 로그인을 불러오지 못했어요. 네트워크를 확인해주세요.'))
    }
    document.head.append(script)
  })
  return gisLoading
}

/** 사용자 동의 창을 띄워 읽기 전용 Access Token을 받는다. 토큰은 이번 가져오기에만 쓰고 저장하지 않는다. */
async function googleAccessToken(): Promise<string> {
  const google = await loadGoogleIdentity()
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
        callback: (response) =>
          response.access_token
            ? resolve(response.access_token)
            : reject(new Error('Google 캘린더 접근이 허용되지 않았어요.')),
        error_callback: () => reject(new Error('Google 캘린더 연결을 취소했어요.')),
      })
      .requestAccessToken()
  })
}

type GoogleEvent = { summary?: string; status?: string; start?: { date?: string; dateTime?: string } }

/** 기본 캘린더의 오늘부터 기간 안 일정. 반복 일정은 Google이 날짜별로 펼쳐 준다. */
export async function googleEvents(from: string, days = 60): Promise<CalendarEvent[]> {
  const token = await googleAccessToken()
  const params = new URLSearchParams({
    timeMin: new Date(`${from}T00:00:00`).toISOString(),
    timeMax: new Date(`${addDays(from, days)}T23:59:59`).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('Google 캘린더 일정을 불러오지 못했어요.')
  const { items = [] } = (await response.json()) as { items?: GoogleEvent[] }
  return items.flatMap((e) => {
    const title = e.summary?.trim()
    const start = e.start?.date || (e.start?.dateTime ? localDateOf(e.start.dateTime) : '')
    return title && start && e.status !== 'cancelled' ? [{ title: title.slice(0, 60), date: start }] : []
  })
}

function localDateOf(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ───────── 계획을 캘린더에 추가 ───────── */

/** Google 캘린더 일정 추가 화면 주소 (로그인한 사용자가 확인 후 저장, 앱 인증 불필요) */
export function googleTemplateUrl(plan: Pick<Plan, 'title' | 'date' | 'note'>) {
  const day = plan.date.replaceAll('-', '')
  const next = addDays(plan.date, 1).replaceAll('-', '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: plan.title,
    dates: `${day}/${next}`,
    details: plan.note ? `${plan.note}\n\nflex-able 소비 계획` : 'flex-able 소비 계획',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

/** 앱: 기기 캘린더 앱의 추가 화면을 연다. 웹: Google 캘린더 추가 화면을 새 창으로 연다. */
export async function addPlanToCalendar(plan: Pick<Plan, 'title' | 'date' | 'note'>) {
  if (isNative) {
    await FlexNative.addCalendarEvent({ title: plan.title, date: plan.date, description: plan.note })
    return
  }
  window.open(googleTemplateUrl(plan), '_blank', 'noopener')
}
