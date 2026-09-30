import { ApiError, request, setAccessToken, type TokenResponse } from './client'
import type {
  Budget,
  Category,
  Estimate,
  Fixed,
  FixedView,
  Ledger,
  Memory,
  Plan,
  PlanView,
  Profile,
  ProtectionCycle,
  Transaction,
  TransactionKind,
  TransactionSource,
} from '../domain'

/* ───────── 서버 코드 ↔ 화면 표시값 ───────── */

const pairs = <A extends string, B extends string>(entries: Array<[A, B]>) => ({
  toServer: Object.fromEntries(entries) as Record<A, B>,
  fromServer: Object.fromEntries(entries.map(([a, b]) => [b, a])) as Record<B, A>,
})
export const categoryCode = pairs<Category, string>([
  ['식비', 'FOOD'],
  ['카페', 'CAFE'],
  ['교통', 'TRANSPORT'],
  ['쇼핑', 'SHOPPING'],
  ['문화', 'CULTURE'],
  ['약속', 'SOCIAL'],
  ['주거', 'HOUSING'],
  ['기타', 'ETC'],
])
const kindCode = pairs<TransactionKind, string>([
  ['expense', 'EXPENSE'],
  ['income', 'INCOME'],
  ['refund', 'REFUND'],
  ['transfer', 'TRANSFER'],
  ['card_payment', 'CARD_PAYMENT'],
])
const methodCode = pairs<'cash' | 'card', string>([
  ['cash', 'CASH'],
  ['card', 'CARD'],
])
const sourceCode = pairs<TransactionSource, string>([
  ['manual', 'MANUAL'],
  ['capture', 'CAPTURE'],
  ['demo', 'DEMO'],
  ['csv', 'CSV'],
  ['notification', 'NOTIFICATION'],
  ['bank', 'BANK'],
])
const cycleCode = pairs<ProtectionCycle, string>([
  ['이번 구간', 'THIS_PERIOD'],
  ['매주', 'WEEKLY'],
  ['매달', 'MONTHLY'],
])

type ServerProfile = {
  name: string
  balance: number
  incomeDate: string
  incomeAmount: number
  protectedAmount: number
  protectionCycle: string
  cardOutstanding: number
  trackingStart: string
  lastReconciledAt: string | null
  notificationTime: string
  notificationsEnabled: boolean
}
type ServerPlan = Omit<PlanView, 'category'> & { category: string }
type ServerTransaction = {
  id: string
  title: string
  amount: number
  date: string
  category: string
  kind: string
  method: string
  planId: string | null
  fixedId: string | null
  refundOf: string | null
  closesItem: boolean
  source: string
}

export const toPlan = (p: ServerPlan): PlanView => ({
  ...p,
  note: p.note || '',
  category: categoryCode.fromServer[p.category],
})
export const toTransaction = (t: ServerTransaction): Transaction => ({
  id: t.id,
  title: t.title,
  amount: t.amount,
  date: t.date,
  category: categoryCode.fromServer[t.category],
  kind: kindCode.fromServer[t.kind],
  method: methodCode.fromServer[t.method],
  planId: t.planId ?? undefined,
  fixedId: t.fixedId ?? undefined,
  refundOf: t.refundOf ?? undefined,
  closesItem: t.closesItem,
  source: sourceCode.fromServer[t.source],
})

/* ───────── 인증 ───────── */

export type Me = { id: string; email: string | null; guest: boolean }

async function signIn(path: string, body: object) {
  const tokens = await request<TokenResponse>('POST', path, { ...body, client: 'WEB' }, { auth: false })
  setAccessToken(tokens.accessToken)
}
export const auth = {
  signup: (email: string, password: string) => signIn('/api/auth/signup', { email, password }),
  login: (email: string, password: string) => signIn('/api/auth/login', { email, password }),
  guest: (demo: boolean) => signIn('/api/auth/guest', { demo }),
  me: () => request<Me>('GET', '/api/auth/me'),
  logout: async () => {
    try {
      await request<void>('POST', '/api/auth/logout', {}, { auth: false })
    } finally {
      setAccessToken(null)
    }
  },
}

/* ───────── 데이터 불러오기 ───────── */

/** 예산 설정 전이면 null */
export async function loadLedger(me: Me): Promise<Ledger | null> {
  let profile: ServerProfile
  try {
    profile = await request<ServerProfile>('GET', '/api/profile')
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
  const [budget, plans, fixed, transactions, reconciliations, memories] = await Promise.all([
    request<Budget>('GET', '/api/budgets/today'),
    request<ServerPlan[]>('GET', '/api/plans'),
    request<FixedView[]>('GET', '/api/fixed-expenses'),
    request<ServerTransaction[]>('GET', '/api/transactions'),
    request<{ reconciledDates: string[] }>('GET', '/api/reconciliations'),
    request<Memory[]>('GET', '/api/memories'),
  ])
  return {
    profile: {
      name: profile.name,
      balance: profile.balance,
      incomeDate: profile.incomeDate,
      incomeAmount: profile.incomeAmount,
      protectedAmount: profile.protectedAmount,
      protectionCycle: cycleCode.fromServer[profile.protectionCycle],
      cardOutstanding: profile.cardOutstanding,
    },
    trackingStart: profile.trackingStart,
    lastReconciled: profile.lastReconciledAt,
    notificationTime: profile.notificationTime,
    notifications: profile.notificationsEnabled,
    guest: me.guest,
    email: me.email,
    fixed,
    plans: plans.map(toPlan),
    transactions: transactions.map(toTransaction),
    memories,
    reconciledDates: reconciliations.reconciledDates,
    budget,
  }
}

/* ───────── 변경 ───────── */

const planBody = (p: Plan) => ({
  title: p.title,
  amount: p.amount,
  date: p.date,
  category: categoryCode.toServer[p.category],
  confirmed: p.confirmed,
  note: p.note,
})
export type TransactionInput = Omit<Transaction, 'source'> & { source?: TransactionSource }
const transactionBody = (t: TransactionInput) => ({
  id: t.id,
  title: t.title,
  amount: t.amount,
  date: t.date,
  category: categoryCode.toServer[t.category],
  kind: kindCode.toServer[t.kind],
  method: methodCode.toServer[t.method],
  planId: t.planId || null,
  fixedId: t.fixedId || null,
  refundOf: t.refundOf || null,
  closesItem: !!t.closesItem,
  source: t.source ? sourceCode.toServer[t.source] : undefined,
})

export type SimulateInput = {
  balance: number
  incomeDate: string
  protectedAmount: number
  cardOutstanding: number
  fixed: Array<{ id?: string; amount: number; date: string }>
}
export type DuplicateInfo = {
  transactionId: string
  title: string
  amount: number
  date: string
  source: TransactionSource
  level: 'EXACT' | 'LIKELY'
}
type ServerDuplicate = Omit<DuplicateInfo, 'source'> & { source: string }
export const toDuplicate = (d: ServerDuplicate): DuplicateInfo => ({
  ...d,
  source: sourceCode.fromServer[d.source],
})

export const ledgerApi = {
  /** 예산 설정 저장 후 고정지출 목록을 화면과 같게 맞춘다 (추가 · 수정 · 삭제). */
  async saveProfile(profile: Profile, fixed: Fixed[], previous: Fixed[]) {
    await request('PUT', '/api/profile', {
      ...profile,
      protectionCycle: cycleCode.toServer[profile.protectionCycle],
    })
    for (const f of previous.filter((p) => !fixed.some((x) => x.id === p.id)))
      await request('DELETE', `/api/fixed-expenses/${f.id}`)
    for (const f of fixed) {
      const before = previous.find((p) => p.id === f.id)
      if (!before || before.title !== f.title || before.amount !== f.amount || before.date !== f.date)
        await request('PUT', `/api/fixed-expenses/${f.id}`, {
          title: f.title,
          amount: f.amount,
          date: f.date,
        })
    }
  },
  saveSettings: (notificationTime: string, notificationsEnabled: boolean) =>
    request('PUT', '/api/profile/settings', { notificationTime, notificationsEnabled }),
  simulate: (input: SimulateInput) => request<Budget>('POST', '/api/budgets/simulate', input),
  previewPlan: (plan: Plan, existingId?: string) =>
    request<{ current: Budget; preview: Budget }>(
      'POST',
      `/api/budgets/preview${existingId ? `?planId=${existingId}` : ''}`,
      planBody(plan),
    ),
  savePlan: (plan: Plan) => request('PUT', `/api/plans/${plan.id}`, planBody(plan)),
  deletePlan: (id: string) => request('DELETE', `/api/plans/${id}`),
  async estimate(category: Category): Promise<Estimate | null> {
    return (
      (await request<Estimate | undefined>(
        'GET',
        `/api/plans/estimate?category=${categoryCode.toServer[category]}`,
      )) ?? null
    )
  },
  createTransaction: (t: TransactionInput) => request('POST', '/api/transactions', transactionBody(t)),
  replaceTransaction: (t: TransactionInput) =>
    request('PUT', `/api/transactions/${t.id}`, transactionBody(t)),
  deleteTransaction: (id: string) => request('DELETE', `/api/transactions/${id}`),
  async duplicates(t: Pick<Transaction, 'title' | 'amount' | 'date' | 'kind'>, excludeId?: string) {
    const found = await request<ServerDuplicate[]>('POST', '/api/transactions/duplicates', {
      title: t.title,
      amount: t.amount,
      date: t.date,
      kind: kindCode.toServer[t.kind],
      excludeId: excludeId || null,
    })
    return found.map(toDuplicate)
  },
  reconcile: (date: string) => request('POST', `/api/reconciliations/${date}`),
  saveMemory: (m: Memory) => request('PUT', `/api/memories/${m.id}`, { title: m.title, text: m.text }),
  deleteMemory: (id: string) => request('DELETE', `/api/memories/${id}`),
  reset: () => request('DELETE', '/api/ledger'),
}

/* ───────── 가져오기 (CSV · 캡처) ───────── */

export type CsvMapping = {
  headerRow: number
  date: number
  title: number
  amount: number
  withdraw: number
  deposit: number
  type: number
}
export type ImportCandidate = {
  title: string
  amount: number
  date: string
  kind: 'expense' | 'income' | 'transfer'
  method: 'cash' | 'card'
  category: Category
  sourceEventId: string | null
  duplicates: DuplicateInfo[]
  sameAsCandidate: number | null
  alreadyImported: boolean
}
export type CandidatesResult = {
  candidates: ImportCandidate[]
  skipped: number
  csv: { mapping: CsvMapping; detected: boolean; creditCard: boolean; headRows: string[][] } | null
}
type ServerCandidate = Omit<ImportCandidate, 'kind' | 'method' | 'category' | 'duplicates'> & {
  kind: string
  method: string
  category: string
  duplicates: ServerDuplicate[]
}
export type ImportItem = {
  id: string
  title: string
  amount: number
  date: string
  category: Category
  kind: 'expense' | 'income' | 'transfer'
  method: 'cash' | 'card'
  planId?: string
  fixedId?: string
  closesItem: boolean
  sourceEventId?: string | null
}

export const importApi = {
  async candidates(
    source: 'csv' | 'capture',
    input: { text: string; mapping?: CsvMapping | null; creditCard?: boolean | null; fallbackDate?: string },
  ): Promise<CandidatesResult> {
    const result = await request<Omit<CandidatesResult, 'candidates'> & { candidates: ServerCandidate[] }>(
      'POST',
      '/api/transactions/import-candidates',
      { source: sourceCode.toServer[source], ...input },
    )
    return {
      ...result,
      candidates: result.candidates.map((c) => ({
        ...c,
        kind: kindCode.fromServer[c.kind] as ImportCandidate['kind'],
        method: methodCode.fromServer[c.method],
        category: categoryCode.fromServer[c.category],
        duplicates: c.duplicates.map(toDuplicate),
      })),
    }
  },
  /** 확인되지 않은 중복이 있으면 ApiError(422, duplicate_requires_confirmation, extra.items)로 거절된다. */
  import: (source: 'csv' | 'capture', items: ImportItem[], acceptDuplicates: string[] = []) =>
    request<{ created: string[]; replayed: string[] }>('POST', '/api/transactions/import', {
      source: sourceCode.toServer[source],
      acceptDuplicates,
      items: items.map((i) => ({
        ...i,
        category: categoryCode.toServer[i.category],
        kind: kindCode.toServer[i.kind],
        method: methodCode.toServer[i.method],
        planId: i.planId || null,
        fixedId: i.fixedId || null,
      })),
    }),
}
