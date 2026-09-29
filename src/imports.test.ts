import { describe, expect, it } from 'vitest'
import { addTransaction, emptyState, findDuplicates, validateState, type AppState } from './domain'
import {
  autoIngest,
  bankRows,
  csvRows,
  decodeCsv,
  detectCsvMapping,
  guessCategory,
  parseCsv,
  parseLooseDate,
  parsePaymentNotification,
} from './imports'

const today = '2026-09-29'
function withTx(title: string, amount: number, date: string, source: 'capture' | 'manual' = 'capture') {
  const state = { ...emptyState(today), profile: { ...emptyState(today).profile, balance: 500000 } }
  return addTransaction(state, {
    id: crypto.randomUUID(),
    title,
    amount,
    date,
    category: '카페',
    kind: 'expense',
    method: 'cash',
    source,
  })
}
const noti = (title: string, text: string, key = 'k1') => ({
  key,
  packageName: 'test.app',
  title,
  text,
  postedAt: new Date('2026-09-28T12:40:00+09:00').getTime(),
})

describe('출처가 다른 같은 결제 찾기', () => {
  it('같은 날짜·금액·이름은 확실한 중복', () => {
    const state = withTx('동네 커피', 4500, '2026-09-28')
    expect(
      findDuplicates(state.transactions, { title: '동네커피', amount: 4500, date: '2026-09-28' })[0].level,
    ).toBe('exact')
  })
  it('가맹점 표기가 달라도 같은 날 같은 금액이면 확인 대상', () => {
    const state = withTx('스타벅스 강남점', 4500, '2026-09-28')
    const found = findDuplicates(state.transactions, {
      title: '스타벅스코리아',
      amount: 4500,
      date: '2026-09-28',
    })
    expect(found).toHaveLength(1)
    expect(found[0].level).toBe('likely')
  })
  it('승인일과 매입일이 하루 다르면 이름이 비슷할 때만 확인 대상', () => {
    const state = withTx('스타벅스 강남점', 4500, '2026-09-28')
    expect(
      findDuplicates(state.transactions, { title: '스타벅스', amount: 4500, date: '2026-09-29' }),
    ).toHaveLength(1)
    expect(
      findDuplicates(state.transactions, { title: '김밥천국', amount: 4500, date: '2026-09-29' }),
    ).toHaveLength(0)
  })
  it('금액이 다르거나 입금과 지출이면 중복이 아님', () => {
    const state = withTx('스타벅스', 4500, '2026-09-28')
    expect(
      findDuplicates(state.transactions, { title: '스타벅스', amount: 4600, date: '2026-09-28' }),
    ).toHaveLength(0)
    expect(
      findDuplicates(state.transactions, {
        title: '스타벅스',
        amount: 4500,
        date: '2026-09-28',
        kind: 'income',
      }),
    ).toHaveLength(0)
  })
})

describe('CSV 가져오기', () => {
  it('EUC-KR로 저장된 엑셀 CSV를 읽는다', () => {
    // "날짜" = B3 AF C2 A5 (EUC-KR)
    const bytes = new Uint8Array([0xb3, 0xaf, 0xc2, 0xa5, 0x0a])
    expect(decodeCsv(bytes.buffer).trim()).toBe('날짜')
  })
  it('따옴표 안의 쉼표와 줄바꿈을 한 칸으로 읽는다', () => {
    expect(parseCsv('a,"1,000원","x\ny"\r\nb,2,3')).toEqual([
      ['a', '1,000원', 'x\ny'],
      ['b', '2', '3'],
    ])
  })
  it('은행 내보내기: 안내 문구 아래 머리행과 출금·입금 열', () => {
    const rows = parseCsv(
      [
        '거래내역 조회,,,,',
        '계좌번호,123-456,,,',
        '거래일시,적요,출금액,입금액,잔액',
        '2026.09.28 12:30:11,스타벅스,"4,500",0,"995,500"',
        '2026.09.27 09:00:00,급여,0,"2,800,000","1,000,000"',
        '2026.09.30 09:00:00,미래 거래,"1,000",0,0',
      ].join('\n'),
    )
    const mapping = detectCsvMapping(rows)!
    expect(mapping.headerRow).toBe(2)
    const result = csvRows(rows, mapping, today)
    expect(result.rows).toEqual([
      { title: '스타벅스', amount: 4500, date: '2026-09-28', kind: 'expense', category: '카페' },
      { title: '급여', amount: 2800000, date: '2026-09-27', kind: 'income', category: '기타' },
    ])
    expect(result.skipped).toBe(1)
  })
  it('카드 이용내역: 금액 한 열, 승인취소 행 제외', () => {
    const rows = parseCsv(
      '이용일자,이용하신곳,이용금액,승인구분\n2026-09-28,김밥천국,8000,승인\n2026-09-28,쿠팡,12000,승인취소',
    )
    const result = csvRows(rows, detectCsvMapping(rows)!, today)
    expect(result.rows).toEqual([
      { title: '김밥천국', amount: 8000, date: '2026-09-28', kind: 'expense', category: '식비' },
    ])
    expect(result.skipped).toBe(1)
  })
  it('부호 있는 거래금액은 음수를 지출, 양수를 입금으로 본다', () => {
    const rows = parseCsv(
      '거래 일시,내용,거래 금액\n2026.09.28 10:00,택시,-12000\n2026.09.28 11:00,환급,3000',
    )
    expect(csvRows(rows, detectCsvMapping(rows)!, today).rows.map((r) => r.kind)).toEqual([
      'expense',
      'income',
    ])
  })
  it('여러 날짜 표기', () => {
    expect(parseLooseDate('20260928', '2026')).toBe('2026-09-28')
    expect(parseLooseDate('26.09.28', '2026')).toBe('2026-09-28')
    expect(parseLooseDate('09/28', '2026')).toBe('2026-09-28')
    expect(parseLooseDate('46293', '2026')).toBe('2026-09-28')
    expect(parseLooseDate('2026.02.30', '2026')).toBe('')
  })
  it('머리행을 찾지 못하면 null', () => {
    expect(detectCsvMapping(parseCsv('a,b\n1,2'))).toBeNull()
  })
})

describe('결제 알림 해석', () => {
  it('신용카드 승인 문자', () => {
    expect(
      parsePaymentNotification(
        noti('', '[Web발신]\n신한카드(1234)승인 홍*동 12,500원(일시불)09/28 12:34 스타벅스 누적1,234,567원'),
      ),
    ).toMatchObject({ title: '스타벅스', amount: 12500, date: '2026-09-28', kind: 'expense', method: 'card' })
  })
  it('줄 단위 카드 알림', () => {
    expect(
      parsePaymentNotification(
        noti(
          'KB국민카드',
          'KB국민카드1234승인\n홍*동님\n8,000원 일시불\n09/27 19:02\n김밥천국\n누적 300,000원',
        ),
      ),
    ).toMatchObject({ title: '김밥천국', amount: 8000, date: '2026-09-27', method: 'card', category: '식비' })
  })
  it('체크카드와 은행 출금은 계좌 결제', () => {
    expect(parsePaymentNotification(noti('출금 12,500원', '카카오T 택시 | 잔액 100,000원'))).toMatchObject({
      title: '카카오T 택시',
      amount: 12500,
      kind: 'expense',
      method: 'cash',
      category: '교통',
    })
    expect(
      parsePaymentNotification(noti('', '우리체크카드 승인 4,500원 09/28 08:10 이디야커피')),
    ).toMatchObject({
      method: 'cash',
      title: '이디야커피',
    })
  })
  it('입금 알림은 수입', () => {
    expect(parsePaymentNotification(noti('입금 2,800,000원', '(주)플렉스 | 잔액 3,000,000원'))).toMatchObject(
      {
        kind: 'income',
        amount: 2800000,
      },
    )
  })
  it('광고·취소·인증번호·금액 없는 알림은 무시', () => {
    expect(parsePaymentNotification(noti('(광고) 이벤트', '결제 시 5,000원 할인'))).toBeNull()
    expect(parsePaymentNotification(noti('', '신한카드 승인취소 12,500원 스타벅스'))).toBeNull()
    expect(parsePaymentNotification(noti('', '인증번호 [123456]'))).toBeNull()
    expect(parsePaymentNotification(noti('친구', '저녁 먹었어?'))).toBeNull()
  })
  it('1월 초에 받은 12월 거래는 작년 날짜', () => {
    const n = {
      ...noti('', '삼성카드 승인 10,000원 12/31 23:50 편의점'),
      postedAt: new Date('2027-01-01T00:10:00+09:00').getTime(),
    }
    expect(parsePaymentNotification(n)?.date).toBe('2026-12-31')
  })
})

describe('자동 등록과 중복 확인 대기', () => {
  it('중복이 아니면 바로 등록하고, 같은 알림은 다시 처리하지 않는다', () => {
    const state = withTx('점심', 9000, '2026-09-27')
    const row = parsePaymentNotification(noti('', '현대카드 승인 12,500원 09/28 12:34 스타벅스'))!
    const first = autoIngest(state, [row], 'notification')
    expect(first).toMatchObject({ added: 1, queued: 0 })
    expect(first.state.profile.cardOutstanding).toBe(12500)
    expect(validateState(first.state)).toBe(true)
    const again = autoIngest(first.state, [row], 'notification')
    expect(again).toMatchObject({ added: 0, queued: 0, ignored: 1 })
  })
  it('캡처로 이미 등록한 결제는 등록하지 않고 확인 대기함에 넣는다', () => {
    const state: AppState = withTx('스타벅스 강남점', 12500, '2026-09-28')
    const row = parsePaymentNotification(noti('', '현대카드 승인 12,500원 09/28 12:34 스타벅스'))!
    const result = autoIngest(state, [row], 'notification')
    expect(result).toMatchObject({ added: 0, queued: 1 })
    expect(result.state.transactions).toHaveLength(1)
    expect(result.state.inbox?.[0]).toMatchObject({
      title: '스타벅스',
      amount: 12500,
      source: 'notification',
    })
    expect(validateState(result.state)).toBe(true)
    expect(autoIngest(result.state, [row], 'notification').ignored).toBe(1)
  })
})

describe('계좌 연동 응답', () => {
  it('형식에 맞는 거래만 받아들인다', () => {
    expect(
      bankRows(
        {
          transactions: [
            { id: 'a1', date: '2026-09-28', title: 'GS25', amount: 3000, direction: 'out' },
            { id: 'a2', date: '2026-09-28', title: '이자', amount: 12, direction: 'in' },
            { id: 'a3', date: '2026-10-01', title: '미래', amount: 1, direction: 'out' },
            { id: 'a4', date: '2026-09-28', title: '음수', amount: -1, direction: 'out' },
          ],
        },
        today,
      ),
    ).toEqual([
      {
        title: 'GS25',
        amount: 3000,
        date: '2026-09-28',
        kind: 'expense',
        method: 'cash',
        category: '식비',
        externalId: 'bank:a1',
      },
      {
        title: '이자',
        amount: 12,
        date: '2026-09-28',
        kind: 'income',
        method: 'cash',
        category: '기타',
        externalId: 'bank:a2',
      },
    ])
    expect(() => bankRows({ items: [] })).toThrow()
  })
})

it('가맹점으로 카테고리 추측', () => {
  expect(guessCategory('메가박스 코엑스')).toBe('문화')
  expect(guessCategory('메가커피 역삼')).toBe('카페')
  expect(guessCategory('알 수 없음')).toBe('기타')
})
