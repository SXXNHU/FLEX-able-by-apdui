/**
 * 화면에서 쓰는 타입과 표시 · 날짜 유틸.
 * 예산 계산 · 거래 반영 · 중복 판정 같은 규칙은 서버(Spring)가 담당하며 여기에는 두지 않는다.
 * parsePlan · parseCalendar는 저장 전에 사용자가 확인하는 입력 보조다.
 */
export type Category = '식비' | '카페' | '교통' | '쇼핑' | '문화' | '약속' | '주거' | '기타'
export const categories: Category[] = ['식비', '카페', '교통', '쇼핑', '문화', '약속', '주거', '기타']
export type TransactionKind = 'expense' | 'income' | 'refund' | 'transfer' | 'card_payment'
export type ProtectionCycle = '이번 구간' | '매주' | '매달'
export interface Profile {
  name: string
  balance: number
  incomeDate: string
  incomeAmount: number
  protectedAmount: number
  protectionCycle: ProtectionCycle
  cardOutstanding: number
}
export interface Fixed {
  id: string
  title: string
  amount: number
  date: string
}
/** 서버가 계산한 확보 현황이 붙은 고정지출 */
export interface FixedView extends Fixed {
  actual: number
  remaining: number
  closed: boolean
  nextPeriod: boolean
}
export interface Plan {
  id: string
  title: string
  amount: number
  date: string
  category: Category
  confirmed: boolean
  note: string
}
/** 서버가 계산한 실제 사용액 · 남은 확보액 · 정산 여부가 붙은 계획 */
export interface PlanView extends Plan {
  actual: number
  remaining: number
  closed: boolean
}
export type TransactionSource = 'manual' | 'capture' | 'demo' | 'csv' | 'notification' | 'bank'
export const sourceLabels: Record<TransactionSource, string> = {
  manual: '직접 입력',
  capture: '캡처 확인',
  demo: '시연 데이터',
  csv: 'CSV 파일',
  notification: '결제 알림',
  bank: '계좌 연동',
}
export interface Transaction {
  id: string
  title: string
  amount: number
  date: string
  category: Category
  kind: TransactionKind
  method: 'cash' | 'card'
  planId?: string
  fixedId?: string
  refundOf?: string
  closesItem?: boolean
  source: TransactionSource
}
export interface Memory {
  id: string
  title: string
  text: string
}
/** 서버의 오늘 기준 예산 계산 결과 */
export interface Budget {
  today: string
  incomeDate: string
  days: number
  balance: number
  cardOutstanding: number
  protectedAmount: number
  fixedReserve: number
  plannedReserve: number
  generalToday: number
  rawRemaining: number
  daily: number
  todayRemaining: number
  todayPlanned: number
  shortage: number
  overToday: number
  provisional: boolean
  pending: string[]
  lastReconciledAt: string | null
}
/** 서버에서 불러온 한 사용자의 화면 데이터 */
export interface Ledger {
  profile: Profile
  trackingStart: string
  lastReconciled: string | null
  notificationTime: string
  notifications: boolean
  guest: boolean
  email: string | null
  fixed: FixedView[]
  plans: PlanView[]
  transactions: Transaction[]
  memories: Memory[]
  reconciledDates: string[]
  budget: Budget
  /** 자동 수집 중 이미 있는 거래 같아 확인을 기다리는 거래 */
  inbox: InboxItem[]
}
export interface InboxItem {
  id: string
  title: string
  amount: number
  date: string
  category: Category
  kind: 'expense' | 'income'
  method: 'cash' | 'card'
  source: TransactionSource
  duplicates: Array<{
    transactionId: string
    title: string
    amount: number
    date: string
    source: TransactionSource
  }>
}
export interface Estimate {
  low: number
  high: number
  suggested: number
  count: number
}
export const uid = () => crypto.randomUUID()
export const won = (value: number) => Math.round(value).toLocaleString('ko-KR')
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function asDate(value: string) {
  return new Date(`${value}T12:00:00`)
}
export function addDays(value: string, count: number) {
  const date = asDate(value)
  date.setDate(date.getDate() + count)
  return localDate(date)
}
export function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}
export function dateLabel(value: string) {
  return asDate(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(asDate(value).getTime()) &&
    localDate(asDate(value)) === value
  )
}
export function parsePlan(text: string, today = localDate()) {
  let date = ''
  let amount = 0
  let category: Category = '기타'
  const explicit = text.match(/(?:(\d{4})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?/)
  if (explicit) {
    date = `${explicit[1] || today.slice(0, 4)}-${explicit[2].padStart(2, '0')}-${explicit[3].padStart(2, '0')}`
    if (!validDate(date)) date = ''
  }
  if (!date && /오늘/.test(text)) date = today
  if (!date && /내일/.test(text)) date = addDays(today, 1)
  if (!date && /모레/.test(text)) date = addDays(today, 2)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const weekday = text.match(/([일월화수목금토])요일/)
  if (!date && weekday) {
    const target = weekdays.indexOf(weekday[1])
    const current = asDate(today).getDay()
    const offset = /다음\s*주/.test(text)
      ? 7 - ((current + 6) % 7) + ((target + 6) % 7)
      : (target - current + 7) % 7
    date = addDays(today, offset)
  }
  const tenThousands = text.match(/(\d+(?:\.\d+)?)\s*만(?:\s*(\d+)\s*천)?\s*원?/)
  const thousands = text.match(/(\d+(?:\.\d+)?)\s*천\s*원/)
  const plain = text.match(/(\d[\d,]*)\s*원/)
  if (tenThousands) amount = Number(tenThousands[1]) * 10000 + Number(tenThousands[2] || 0) * 1000
  else if (thousands) amount = Number(thousands[1]) * 1000
  else if (plain) amount = Number(plain[1].replace(/,/g, ''))
  if (/데이트|약속|술|친구/.test(text)) category = '약속'
  else if (/모니터|구매|쇼핑|옷|신발/.test(text)) category = '쇼핑'
  else if (/영화|공연|전시/.test(text)) category = '문화'
  else if (/식사|저녁|점심|밥/.test(text)) category = '식비'
  else if (/카페|커피/.test(text)) category = '카페'
  return { title: text.trim().slice(0, 60), date, amount, category, note: text.trim() }
}
export function parseCalendar(text: string): Array<{ title: string; date: string }> {
  return text
    .replace(/\r?\n[ \t]/g, '')
    .split('BEGIN:VEVENT')
    .slice(1)
    .flatMap((block) => {
      const title = block
        .match(/(?:^|\n)SUMMARY(?:;[^:]*)?:(.*)/)?.[1]
        .trim()
        .replace(/\\n/g, ' ')
        .replace(/\\,/g, ',')
      const raw =
        block.match(/(?:^|\n)DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{6})(Z)?)/) ||
        block.match(/(?:^|\n)DTSTART(?:;[^:]*)?:(\d{8})/)
      if (!title || !raw) return []
      let date = `${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}`
      if (raw[3] === 'Z' && raw[2])
        date = localDate(
          new Date(`${date}T${raw[2].slice(0, 2)}:${raw[2].slice(2, 4)}:${raw[2].slice(4, 6)}Z`),
        )
      return validDate(date) ? [{ title, date }] : []
    })
}
