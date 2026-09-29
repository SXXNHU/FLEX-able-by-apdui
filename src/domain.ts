export type Category = '식비' | '카페' | '교통' | '쇼핑' | '문화' | '약속' | '주거' | '기타'
export const categories: Category[] = ['식비', '카페', '교통', '쇼핑', '문화', '약속', '주거', '기타']
export type TransactionKind = 'expense' | 'income' | 'refund' | 'transfer' | 'card_payment'
export interface Profile {
  name: string
  balance: number
  incomeDate: string
  incomeAmount: number
  protectedAmount: number
  protectionCycle: '이번 구간' | '매주' | '매달'
  cardOutstanding: number
}
export interface Fixed {
  id: string
  title: string
  amount: number
  date: string
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
  source: 'manual' | 'capture' | 'demo'
}
export interface Memory {
  id: string
  title: string
  text: string
}
export interface AppState {
  version: 1
  profile: Profile
  fixed: Fixed[]
  plans: Plan[]
  transactions: Transaction[]
  memories: Memory[]
  reconciledDates: string[]
  trackingStart?: string
  lastReconciled: string | null
  notificationTime: string
  notifications: boolean
  demo: boolean
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
export function isClosed(state: AppState, itemId: string) {
  return state.transactions.some(
    (t) => (t.planId === itemId || t.fixedId === itemId) && t.kind === 'expense' && t.closesItem,
  )
}
export function actualFor(state: AppState, itemId: string) {
  return state.transactions
    .filter((t) => t.planId === itemId || t.fixedId === itemId)
    .reduce((sum, t) => sum + (t.kind === 'expense' ? t.amount : t.kind === 'refund' ? -t.amount : 0), 0)
}
export function remainingFor(state: AppState, item: Plan | Fixed) {
  return isClosed(state, item.id) ? 0 : Math.max(0, item.amount - actualFor(state, item.id))
}
export function pendingDates(state: AppState, today = localDate()) {
  const start = state.trackingStart || addDays(today, -1)
  const count = Math.min(20000, Math.max(0, dayDiff(start, today)))
  const tracked = Array.from({ length: count }, (_, i) => addDays(start, i))
  const historical = state.transactions.map((t) => t.date).filter((d) => d < today)
  return [...new Set([...tracked, ...historical])].filter((d) => !state.reconciledDates.includes(d)).sort()
}
export function budget(state: AppState, today = localDate()) {
  const days = dayDiff(today, state.profile.incomeDate)
  const activePlans = state.plans.filter(
    (p) => p.confirmed && p.date < state.profile.incomeDate && !isClosed(state, p.id),
  )
  const fixedReserve = state.fixed
    .filter((f) => f.date < state.profile.incomeDate)
    .reduce((n, f) => n + remainingFor(state, f), 0)
  const plannedReserve = activePlans.reduce((n, p) => n + remainingFor(state, p), 0)
  const generalToday = state.transactions
    .filter((t) => t.date === today && !t.planId && !t.fixedId)
    .reduce((n, t) => n + (t.kind === 'expense' ? t.amount : t.kind === 'refund' ? -t.amount : 0), 0)
  const rawRemaining =
    state.profile.balance -
    fixedReserve -
    Math.max(0, state.profile.cardOutstanding) -
    state.profile.protectedAmount -
    plannedReserve
  const daily = days > 0 ? Math.max(0, Math.floor((rawRemaining + generalToday) / days)) : 0
  const todayRemaining = days > 0 ? Math.max(0, daily - generalToday) : 0
  const todayPlanned = activePlans
    .filter((p) => p.date === today)
    .reduce((n, p) => n + remainingFor(state, p), 0)
  const pending = pendingDates(state, today)
  return {
    days,
    activePlans,
    fixedReserve,
    plannedReserve,
    generalToday,
    rawRemaining,
    daily,
    todayRemaining,
    todayPlanned,
    shortage: Math.max(0, -rawRemaining),
    overToday: Math.max(0, generalToday - daily),
    provisional: pending.length > 0,
    pending,
  }
}
function applyMoney(profile: Profile, tx: Transaction, direction: 1 | -1): Profile {
  const next = { ...profile }
  const amount = tx.amount * direction
  if (tx.kind === 'expense') {
    if (tx.method === 'card') next.cardOutstanding += amount
    else next.balance -= amount
  }
  if (tx.kind === 'refund') {
    if (tx.method === 'card') next.cardOutstanding -= amount
    else next.balance += amount
  }
  if (tx.kind === 'income') next.balance += amount
  if (tx.kind === 'card_payment') {
    next.balance -= amount
    next.cardOutstanding -= amount
  }
  return next
}
export function addTransaction(state: AppState, tx: Transaction): AppState {
  if (!Number.isSafeInteger(tx.amount) || tx.amount <= 0 || tx.amount > 1e12)
    throw new Error('금액은 1원 이상의 정수로 입력해주세요.')
  if (!validDate(tx.date) || tx.date > localDate())
    throw new Error('거래 날짜는 오늘 또는 이전 날짜로 입력해주세요.')
  if (!tx.title.trim()) throw new Error('거래 이름을 입력해주세요.')
  if (state.transactions.some((t) => t.id === tx.id)) throw new Error('이미 반영된 거래예요.')
  if (tx.planId && tx.fixedId) throw new Error('계획과 고정지출 중 하나만 연결해주세요.')
  if ((tx.planId || tx.fixedId) && !['expense', 'refund'].includes(tx.kind))
    throw new Error('소비 또는 환불만 계획과 연결할 수 있어요.')
  if (tx.planId && !state.plans.some((p) => p.id === tx.planId && p.confirmed))
    throw new Error('확정된 소비 계획을 선택해주세요.')
  if (tx.fixedId && !state.fixed.some((f) => f.id === tx.fixedId))
    throw new Error('고정지출을 다시 선택해주세요.')
  if (tx.kind === 'card_payment' && tx.amount > Math.max(0, state.profile.cardOutstanding))
    throw new Error('납부액이 현재 미결제 카드액보다 커요.')
  if (tx.kind === 'refund') {
    const original = state.transactions.find((t) => t.id === tx.refundOf && t.kind === 'expense')
    if (!original) throw new Error('환불할 원래 결제내역을 선택해주세요.')
    const refunded = state.transactions
      .filter((t) => t.refundOf === original.id)
      .reduce((sum, t) => sum + t.amount, 0)
    if (tx.amount + refunded > original.amount)
      throw new Error('남아 있는 원거래 금액보다 많이 환불할 수 없어요.')
    tx = {
      ...tx,
      method: original.method,
      planId: original.planId,
      fixedId: original.fixedId,
      closesItem: false,
    }
  }
  return {
    ...state,
    profile: applyMoney(state.profile, tx, 1),
    transactions: [tx, ...state.transactions],
    reconciledDates: state.reconciledDates.filter((d) => d !== tx.date),
  }
}
export function removeTransaction(state: AppState, id: string): AppState {
  const tx = state.transactions.find((t) => t.id === id)
  if (!tx) return state
  if (state.transactions.some((t) => t.refundOf === id)) throw new Error('연결된 환불을 먼저 삭제해주세요.')
  const profile = applyMoney(state.profile, tx, -1)
  return {
    ...state,
    profile,
    transactions: state.transactions.filter((t) => t.id !== id),
    reconciledDates: state.reconciledDates.filter((d) => d !== tx.date),
  }
}
export function isDuplicate(state: AppState, tx: Pick<Transaction, 'date' | 'amount' | 'title'>) {
  return state.transactions.some(
    (t) =>
      t.date === tx.date &&
      t.amount === tx.amount &&
      t.title.replace(/\s/g, '') === tx.title.replace(/\s/g, ''),
  )
}
export function emptyState(today = localDate()): AppState {
  return {
    version: 1,
    profile: {
      name: '',
      balance: 0,
      incomeDate: addDays(today, 10),
      incomeAmount: 0,
      protectedAmount: 0,
      protectionCycle: '이번 구간',
      cardOutstanding: 0,
    },
    fixed: [],
    plans: [],
    transactions: [],
    memories: [],
    reconciledDates: [],
    trackingStart: addDays(today, -1),
    lastReconciled: null,
    notificationTime: '21:00',
    notifications: false,
    demo: false,
  }
}
export function demoState(today = localDate()): AppState {
  const state = emptyState(today)
  state.demo = true
  state.profile = {
    name: '플렉서',
    balance: 1420000,
    incomeDate: addDays(today, 10),
    incomeAmount: 2800000,
    protectedAmount: 250000,
    protectionCycle: '이번 구간',
    cardOutstanding: 220000,
  }
  state.fixed = [
    { id: uid(), title: '월세', amount: 550000, date: addDays(today, 3) },
    { id: uid(), title: '통신 · 구독', amount: 100000, date: addDays(today, 6) },
  ]
  state.plans = [
    {
      id: uid(),
      title: '토요일, 저녁과 영화',
      amount: 80000,
      date: parsePlan('토요일', today).date,
      category: '약속',
      confirmed: true,
      note: '둘이 데이트 · 내 부담 금액 80,000원',
    },
    {
      id: uid(),
      title: '새 모니터 장만하기',
      amount: 300000,
      date: addDays(today, 20),
      category: '쇼핑',
      confirmed: false,
      note: '다음 수입 이후 구매를 검토 중이에요.',
    },
  ]
  state.transactions = [
    {
      id: uid(),
      title: '점심 한 그릇',
      amount: 9500,
      date: addDays(today, -1),
      category: '식비',
      kind: 'expense',
      method: 'cash',
      source: 'demo',
    },
    {
      id: uid(),
      title: '동네 커피',
      amount: 4500,
      date: addDays(today, -1),
      category: '카페',
      kind: 'expense',
      method: 'cash',
      source: 'demo',
    },
    {
      id: uid(),
      title: '퇴근길 버스',
      amount: 1500,
      date: addDays(today, -1),
      category: '교통',
      kind: 'expense',
      method: 'cash',
      source: 'demo',
    },
  ]
  // The opening balance already reflects these historical demonstration transactions.
  state.memories = [
    { id: uid(), title: '데이트 예산 기준', text: '식사와 영화 비용 중 내가 부담할 금액만 계획에 넣기.' },
    { id: uid(), title: '지키고 싶은 돈', text: '비상금 25만 원은 생활비로 사용하지 않기.' },
  ]
  return state
}
export function estimateFromHistory(state: AppState, category: Category) {
  const amounts = state.plans
    .filter((p) => p.category === category && isClosed(state, p.id))
    .map((p) => actualFor(state, p.id))
    .filter((a) => a > 0)
    .slice(-8)
  if (!amounts.length) return null
  const sorted = [...amounts].sort((a, b) => a - b)
  return {
    low: sorted[0],
    high: sorted[sorted.length - 1],
    suggested: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
    count: amounts.length,
  }
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
export function parseCaptureText(text: string, fallbackDate: string) {
  let date = fallbackDate
  const result: Array<{ title: string; amount: number; date: string }> = []
  let previous = ''
  for (const line of text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    const matchDate = line.match(/(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?/)
    if (matchDate) {
      const candidate = `${matchDate[1] || fallbackDate.slice(0, 4)}-${matchDate[2].padStart(2, '0')}-${matchDate[3].padStart(2, '0')}`
      if (validDate(candidate)) date = candidate
    }
    const money = line.match(/[-−]?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*원/)
    if (money && !/잔액|총액|합계|한도|누적/.test(line)) {
      const amount = Number(money[1].replace(/,/g, ''))
      const title =
        line
          .replace(money[0], '')
          .replace(/\d{1,2}:\d{2}/g, '')
          .replace(matchDate?.[0] || '\u0000', '')
          .trim() ||
        previous ||
        '상호 확인 필요'
      if (amount > 0 && Number.isSafeInteger(amount)) result.push({ title: title.slice(0, 60), amount, date })
    }
    if (!matchDate && !money && !/잔액|결제내역|이용내역|거래내역/.test(line)) previous = line
  }
  return result
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
export function validateState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const s = value as AppState
  const money = (v: unknown, signed = false) =>
    typeof v === 'number' && Number.isSafeInteger(v) && Math.abs(v) <= 1e12 && (signed || v >= 0)
  const str = (v: unknown) => typeof v === 'string' && v.length <= 10000
  const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 100
  if (
    s.version !== 1 ||
    !s.profile ||
    !str(s.profile.name) ||
    !money(s.profile.balance, true) ||
    !money(s.profile.incomeAmount) ||
    !money(s.profile.protectedAmount) ||
    !money(s.profile.cardOutstanding, true) ||
    !validDate(s.profile.incomeDate) ||
    !['이번 구간', '매주', '매달'].includes(s.profile.protectionCycle)
  )
    return false
  if (
    ![s.plans, s.fixed, s.transactions, s.memories, s.reconciledDates].every(
      (a) => Array.isArray(a) && a.length <= 20000,
    )
  )
    return false
  if (!s.fixed.every((f) => f && id(f.id) && str(f.title) && money(f.amount) && validDate(f.date)))
    return false
  if (
    !s.plans.every(
      (p) =>
        p &&
        id(p.id) &&
        str(p.title) &&
        str(p.note) &&
        money(p.amount) &&
        validDate(p.date) &&
        categories.includes(p.category) &&
        typeof p.confirmed === 'boolean',
    )
  )
    return false
  if (!s.memories.every((m) => m && id(m.id) && str(m.title) && str(m.text))) return false
  if (
    !s.transactions.every(
      (t) =>
        t &&
        id(t.id) &&
        str(t.title) &&
        money(t.amount) &&
        t.amount > 0 &&
        validDate(t.date) &&
        categories.includes(t.category) &&
        ['expense', 'income', 'refund', 'transfer', 'card_payment'].includes(t.kind) &&
        ['cash', 'card'].includes(t.method) &&
        ['manual', 'capture', 'demo'].includes(t.source) &&
        (t.closesItem === undefined || typeof t.closesItem === 'boolean') &&
        !(t.planId && t.fixedId) &&
        (!t.planId || s.plans.some((p) => p.id === t.planId)) &&
        (!t.fixedId || s.fixed.some((f) => f.id === t.fixedId)) &&
        (t.kind !== 'refund' || s.transactions.some((o) => o.id === t.refundOf && o.kind === 'expense')),
    )
  )
    return false
  if (
    [s.plans, s.fixed, s.transactions, s.memories].some(
      (items) => new Set(items.map((i) => i.id)).size !== items.length,
    )
  )
    return false
  if (new Set([...s.plans, ...s.fixed].map((i) => i.id)).size !== s.plans.length + s.fixed.length)
    return false
  if (s.trackingStart !== undefined && !validDate(s.trackingStart)) return false
  for (const t of s.transactions) {
    if (t.kind !== 'expense' && t.kind !== 'refund' && (t.planId || t.fixedId)) return false
    if (t.kind === 'refund') {
      const original = s.transactions.find((o) => o.id === t.refundOf)!
      if (
        t.method !== original.method ||
        t.planId !== original.planId ||
        t.fixedId !== original.fixedId ||
        t.closesItem
      )
        return false
      if (
        s.transactions.filter((r) => r.refundOf === original.id).reduce((sum, r) => sum + r.amount, 0) >
        original.amount
      )
        return false
    } else if (t.refundOf) return false
  }
  return (
    s.reconciledDates.every(validDate) &&
    (s.lastReconciled === null || (str(s.lastReconciled) && Number.isFinite(Date.parse(s.lastReconciled)))) &&
    typeof s.demo === 'boolean' &&
    typeof s.notifications === 'boolean' &&
    typeof s.notificationTime === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(s.notificationTime)
  )
}
