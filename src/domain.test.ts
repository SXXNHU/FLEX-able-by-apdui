import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  actualFor,
  addDays,
  addTransaction,
  budget,
  dayDiff,
  demoState,
  emptyState,
  estimateFromHistory,
  isClosed,
  parseCalendar,
  parseCaptureText,
  parsePlan,
  remainingFor,
  removeTransaction,
  validateState,
  type AppState,
  type Transaction,
} from './domain'
const today = '2026-09-29'
function base(): AppState {
  const s = emptyState(today)
  s.profile.balance = 300000
  s.profile.name = '테스트'
  return s
}
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    title: '점심',
    amount: 10000,
    date: today,
    category: '식비',
    kind: 'expense',
    method: 'cash',
    source: 'manual',
    ...overrides,
  }
}
function planned(): AppState {
  const s = base()
  s.plans.push({
    id: 'date',
    title: '데이트',
    amount: 80000,
    date: '2026-10-03',
    category: '약속',
    confirmed: true,
    note: '',
  })
  return s
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${today}T15:00:00`))
})
afterEach(() => vi.useRealTimers())
describe('일일 예산 계산', () => {
  it('다음 수입일을 제외하고 오늘 포함 10일로 나눈다', () => {
    expect(budget(base(), today).days).toBe(10)
    expect(budget(base(), today).daily).toBe(30000)
  })
  it('8만원 계획 확보 후 하루 22,000원이 된다', () => {
    expect(budget(planned(), today).daily).toBe(22000)
    expect(budget(demoState(today), today).daily).toBe(22000)
  })
  it('예정 수입액을 현재 사용 가능액에 더하지 않는다', () => {
    const s = base()
    s.profile.incomeAmount = 2800000
    expect(budget(s, today).daily).toBe(30000)
  })
  it('오늘 소비를 이중 차감하지 않는다', () => {
    const s = addTransaction(base(), tx())
    expect(budget(s, today)).toMatchObject({
      rawRemaining: 290000,
      daily: 30000,
      todayRemaining: 20000,
      generalToday: 10000,
    })
  })
  it('다음 날 절약한 돈을 남은 9일로 재분배한다', () => {
    const s = addTransaction(base(), tx())
    expect(budget(s, addDays(today, 1)).daily).toBe(Math.floor(290000 / 9))
  })
  it('초과 소비와 전체 구간 부족을 구분한다', () => {
    const s = addTransaction(base(), tx({ amount: 40000 }))
    expect(budget(s, today)).toMatchObject({ todayRemaining: 0, overToday: 10000, shortage: 0 })
    expect(budget(s, addDays(today, 1)).daily).toBe(Math.floor(260000 / 9))
  })
  it('음수 예산은 0원과 부족액으로 표시한다', () => {
    const s = base()
    s.profile.protectedAmount = 350000
    expect(budget(s, today)).toMatchObject({ todayRemaining: 0, shortage: 50000 })
  })
  it('수입일이 지난 경우 0으로 나누지 않는다', () => {
    const s = base()
    s.profile.incomeDate = today
    expect(budget(s, today)).toMatchObject({ days: 0, daily: 0, todayRemaining: 0 })
  })
  it('미확정 또는 다음 구간 계획은 차감하지 않는다', () => {
    const s = planned()
    s.plans[0].confirmed = false
    expect(budget(s, today).daily).toBe(30000)
    s.plans[0].confirmed = true
    s.plans[0].date = s.profile.incomeDate
    expect(budget(s, today).daily).toBe(30000)
  })
  it('날짜가 지난 미정산 계획은 계속 확보한다', () => {
    const s = planned()
    s.plans[0].date = addDays(today, -1)
    expect(budget(s, today).plannedReserve).toBe(80000)
  })
  it('전날 확인이 없으면 잠정 금액이며 자동 무지출 확정하지 않는다', () => {
    const s = base()
    expect(budget(s, today).provisional).toBe(true)
    s.reconciledDates.push(addDays(today, -1))
    expect(budget(s, today).provisional).toBe(false)
  })
})
describe('계획과 실제 거래 연결', () => {
  it('8만원 계획을 7만원으로 정산하면 차액 1만원을 돌린다', () => {
    const s = addTransaction(planned(), tx({ amount: 70000, planId: 'date', closesItem: true }))
    expect(budget(s, today)).toMatchObject({
      plannedReserve: 0,
      rawRemaining: 230000,
      daily: 23000,
      generalToday: 0,
    })
    expect(isClosed(s, 'date')).toBe(true)
  })
  it('부분 결제는 남은 계획 확보액만 줄인다', () => {
    const s = addTransaction(planned(), tx({ amount: 30000, planId: 'date', closesItem: false }))
    expect(remainingFor(s, s.plans[0])).toBe(50000)
    expect(budget(s, today).rawRemaining).toBe(220000)
  })
  it('계획 초과 소비를 숨기지 않는다', () => {
    const s = addTransaction(planned(), tx({ amount: 100000, planId: 'date', closesItem: true }))
    expect(budget(s, today).rawRemaining).toBe(200000)
    expect(actualFor(s, 'date')).toBe(100000)
  })
  it('정산 거래 삭제 시 잔액과 계획 확보 상태를 되돌린다', () => {
    const transaction = tx({ amount: 70000, planId: 'date', closesItem: true })
    const s = removeTransaction(addTransaction(planned(), transaction), transaction.id)
    expect(s.profile.balance).toBe(300000)
    expect(budget(s, today).plannedReserve).toBe(80000)
  })
  it('계획 취소는 확보액을 돌린다', () => {
    const s = planned()
    s.plans = []
    expect(budget(s, today).rawRemaining).toBe(300000)
  })
  it('고정지출 납부 시 잔액과 확보액이 동시에 줄어든다', () => {
    const s = base()
    s.fixed.push({ id: 'rent', title: '월세', amount: 100000, date: addDays(today, 2) })
    const next = addTransaction(s, tx({ fixedId: 'rent', amount: 100000, closesItem: true }))
    expect(budget(next, today).rawRemaining).toBe(budget(s, today).rawRemaining)
    expect(budget(next, today).fixedReserve).toBe(0)
  })
  it('개인화 금액 제안은 정산된 실제 계획만 사용한다', () => {
    expect(estimateFromHistory(planned(), '약속')).toBe(null)
    const s = addTransaction(planned(), tx({ amount: 70000, planId: 'date', closesItem: true }))
    expect(estimateFromHistory(s, '약속')).toEqual({ low: 70000, high: 70000, suggested: 70000, count: 1 })
  })
})
describe('카드 · 이체 · 환불', () => {
  it('카드 소비는 잔액 대신 미결제액으로 확보한다', () => {
    const s = addTransaction(base(), tx({ method: 'card' }))
    expect(s.profile.balance).toBe(300000)
    expect(s.profile.cardOutstanding).toBe(10000)
    expect(budget(s, today).todayRemaining).toBe(20000)
  })
  it('카드대금 납부가 두 번째 소비가 되지 않는다', () => {
    const s = addTransaction(base(), tx({ method: 'card' }))
    const next = addTransaction(s, tx({ kind: 'card_payment' }))
    expect(next.profile).toMatchObject({ balance: 290000, cardOutstanding: 0 })
    expect(budget(next, today).rawRemaining).toBe(budget(s, today).rawRemaining)
  })
  it('확보된 카드액보다 큰 납부는 거절한다', () => {
    expect(() => addTransaction(base(), tx({ kind: 'card_payment' }))).toThrow('미결제')
  })
  it('내 계좌 이체는 잔액과 소비에 영향을 주지 않는다', () => {
    const s = addTransaction(base(), tx({ kind: 'transfer' }))
    expect(budget(s, today).rawRemaining).toBe(300000)
    expect(budget(s, today).generalToday).toBe(0)
  })
  it('환불은 원거래의 결제 방법을 따르고 누적 한도를 지킨다', () => {
    const original = tx({ method: 'card' })
    let s = addTransaction(base(), original)
    s = addTransaction(s, tx({ kind: 'refund', refundOf: original.id, amount: 6000, method: 'cash' }))
    expect(s.profile.cardOutstanding).toBe(4000)
    expect(s.profile.balance).toBe(300000)
    expect(() => addTransaction(s, tx({ kind: 'refund', refundOf: original.id, amount: 5000 }))).toThrow(
      '원거래',
    )
  })
  it('환불된 원거래는 바로 삭제할 수 없다', () => {
    const original = tx()
    const s = addTransaction(addTransaction(base(), original), tx({ kind: 'refund', refundOf: original.id }))
    expect(() => removeTransaction(s, original.id)).toThrow('환불')
  })
  it('계획 환불은 원거래 연결을 유지한다', () => {
    const original = tx({ amount: 70000, planId: 'date', closesItem: true })
    const s = addTransaction(
      addTransaction(planned(), original),
      tx({ kind: 'refund', refundOf: original.id, amount: 10000 }),
    )
    expect(s.transactions[0].planId).toBe('date')
    expect(budget(s, today)).toMatchObject({ generalToday: 0, rawRemaining: 240000 })
    expect(actualFor(s, 'date')).toBe(60000)
  })
  it('소수·음수·잘못된 날짜 거래는 거절한다', () => {
    expect(() => addTransaction(base(), tx({ amount: -1 }))).toThrow()
    expect(() => addTransaction(base(), tx({ amount: 0.5 }))).toThrow()
    expect(() => addTransaction(base(), tx({ date: '2026-02-30' }))).toThrow()
    expect(() => addTransaction(base(), tx({ date: addDays(today, 1) }))).toThrow()
  })
})
describe('입력 추출과 저장', () => {
  it('자연어의 토요일과 본인 금액을 추출한다', () => {
    expect(parsePlan('토요일 데이트 8만 원', today)).toMatchObject({
      date: '2026-10-03',
      amount: 80000,
      category: '약속',
    })
    expect(parsePlan('다음주 토요일 3만 5천 원', today)).toMatchObject({ date: '2026-10-10', amount: 35000 })
    expect(parsePlan('모니터 300,000원', today)).toMatchObject({ date: '', amount: 300000, category: '쇼핑' })
  })
  it('모호한 금액은 만들어 넣지 않는다', () => {
    expect(parsePlan('친구랑 점심', today).amount).toBe(0)
  })
  it('캡처 문자에서 날짜와 거래 후보를 추출하며 잔액은 제외한다', () => {
    expect(parseCaptureText('2026.09.28\n동네 커피 4,500원\n잔액 200,000원\n점심\n9,000원', today)).toEqual([
      { title: '동네 커피', amount: 4500, date: '2026-09-28' },
      { title: '점심', amount: 9000, date: '2026-09-28' },
    ])
  })
  it('캘린더 일정을 미확정 계획의 원본으로 읽는다', () => {
    expect(
      parseCalendar(
        'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261003\nSUMMARY:저녁 약속\nEND:VEVENT\nEND:VCALENDAR',
      ),
    ).toEqual([{ date: '2026-10-03', title: '저녁 약속' }])
  })
  it('윤년 및 연도 경계의 날짜 계산이 유지된다', () => {
    expect(dayDiff('2028-02-28', '2028-03-01')).toBe(2)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('저장 형식과 참조가 깨진 백업은 거절한다', () => {
    const s = demoState(today)
    expect(validateState(s)).toBe(true)
    expect(validateState({ ...s, profile: { ...s.profile, balance: '1000' } })).toBe(false)
    expect(validateState({ ...s, notificationTime: '99:99' })).toBe(false)
    expect(validateState({ ...s, transactions: [tx({ planId: 'missing' })] })).toBe(false)
    expect(validateState({ version: 1 })).toBe(false)
  })
  it('새 거래 추가 후 해당 날짜의 정산 확인을 무효화한다', () => {
    const s = base()
    s.reconciledDates.push(today)
    expect(addTransaction(s, tx()).reconciledDates).not.toContain(today)
  })
  it('어제만 확인해도 이전 미확인 날짜가 남으면 잠정 상태다', () => {
    const s = base()
    s.trackingStart = addDays(today, -3)
    s.reconciledDates = [addDays(today, -1)]
    expect(budget(s, today).pending).toEqual([addDays(today, -3), addDays(today, -2)])
    expect(budget(s, today).provisional).toBe(true)
  })
  it('백업의 환불 결제방법이 원거래와 다르면 복원을 거부한다', () => {
    const original = tx({ method: 'card' })
    const s = addTransaction(addTransaction(base(), original), tx({ kind: 'refund', refundOf: original.id }))
    s.transactions[0].method = 'cash'
    expect(validateState(s)).toBe(false)
  })
})
