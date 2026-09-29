import {
  addTransaction,
  findDuplicates,
  localDate,
  uid,
  validDate,
  type AppState,
  type Category,
  type PendingImport,
} from './domain'

/** 외부에서 읽어온 거래 한 건. 사용자 확인(또는 중복 검사) 후 Transaction으로 등록한다. */
export interface ImportedRow {
  title: string
  amount: number
  date: string
  kind: 'expense' | 'income'
  method?: 'cash' | 'card'
  category?: Category
  externalId?: string
}

const categoryRules: Array<[RegExp, Category]> = [
  [
    /카페|커피|스타벅스|투썸|이디야|메가커피|메가mgc|컴포즈|빽다방|폴바셋|블루보틀|할리스|공차|베이커리|파리바게뜨|뚜레쥬르/i,
    '카페',
  ],
  [/택시|카카오t|버스|지하철|철도|코레일|ktx|srt|티머니|교통|주유|주차|쏘카|따릉이/i, '교통'],
  [/cgv|메가박스|롯데시네마|영화|공연|티켓|인터파크|yes24|넷플릭스|멜론|스포티파이|전시/i, '문화'],
  [
    /쿠팡|11번가|g마켓|옥션|무신사|지그재그|올리브영|다이소|네이버페이|스토어|몰|아울렛|백화점|이마트|홈플러스|롯데마트/i,
    '쇼핑',
  ],
  [/관리비|월세|전기|가스|수도|통신|kt|skt|lgu|보험/i, '주거'],
  [
    /식당|김밥|분식|치킨|피자|버거|맥도날드|롯데리아|배달의민족|배민|요기요|쿠팡이츠|편의점|gs25|씨유|cu편의점|세븐일레븐|이마트24|국밥|반점|식육|푸드/i,
    '식비',
  ],
]
export function guessCategory(title: string): Category {
  return categoryRules.find(([rule]) => rule.test(title))?.[1] ?? '기타'
}

/* ───────────────────────── CSV ───────────────────────── */

/** 엑셀이 만든 한국어 CSV는 CP949(EUC-KR)인 경우가 많아 UTF-8 해석이 실패하면 EUC-KR로 다시 읽는다. */
export function decodeCsv(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('euc-kr').decode(buffer)
  }
}

export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = ['\t', ';', ','].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ',',
  )
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && !cell) quoted = true
    else if (c === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export interface CsvMapping {
  headerRow: number
  date: number
  title: number
  /** 하나의 금액 열(카드 이용내역, 부호 있는 계좌 내역) */
  amount: number
  /** 계좌 내역의 출금 · 입금 열 */
  withdraw: number
  deposit: number
  /** 입금/출금, 승인/취소 등의 구분 열 */
  type: number
}
const headerKeywords: Record<Exclude<keyof CsvMapping, 'headerRow'>, string[]> = {
  date: [
    '거래일시',
    '거래일자',
    '이용일시',
    '이용일자',
    '승인일시',
    '승인일자',
    '거래일',
    '이용일',
    '승인일',
    '결제일',
    '일자',
    '날짜',
    '일시',
    'date',
  ],
  title: [
    '가맹점명',
    '이용가맹점',
    '이용하신곳',
    '이용처',
    '가맹점',
    '사용처',
    '상호',
    '거래처',
    '받는분',
    '보낸분',
    '적요',
    '거래내용',
    '기재내용',
    '내용',
    '메모',
    'description',
    'merchant',
  ],
  withdraw: ['출금금액', '출금액', '찾으신금액', '지급금액', '출금'],
  deposit: ['입금금액', '입금액', '맡기신금액', '입금'],
  amount: ['이용금액', '승인금액', '결제금액', '거래금액', '결제원금', '금액', 'amount'],
  type: ['입출금구분', '거래구분', '승인구분', '거래유형', '구분', '상태', 'type'],
}
const clean = (value: string) => value.replace(/[\s"'()[\]]/g, '').toLowerCase()
function findColumn(header: string[], keywords: string[], taken: number[]) {
  for (const keyword of keywords) {
    const exact = header.findIndex((h, i) => !taken.includes(i) && clean(h) === keyword)
    if (exact >= 0) return exact
  }
  for (const keyword of keywords) {
    const partial = header.findIndex((h, i) => !taken.includes(i) && clean(h).includes(keyword))
    if (partial >= 0) return partial
  }
  return -1
}
/** 은행·카드사 내보내기 파일의 머리행과 열을 추측한다. 은행마다 위쪽에 안내 문구가 있어 앞쪽 30행을 살핀다. */
export function detectCsvMapping(rows: string[][]): CsvMapping | null {
  for (let headerRow = 0; headerRow < Math.min(30, rows.length); headerRow++) {
    const header = rows[headerRow]
    const date = findColumn(header, headerKeywords.date, [])
    if (date < 0) continue
    const withdraw = findColumn(header, headerKeywords.withdraw, [date])
    const deposit = findColumn(header, headerKeywords.deposit, [date, withdraw])
    const amount = withdraw >= 0 ? -1 : findColumn(header, headerKeywords.amount, [date, withdraw, deposit])
    if (amount < 0 && withdraw < 0) continue
    const title = findColumn(header, headerKeywords.title, [date, withdraw, deposit, amount])
    const type = findColumn(header, headerKeywords.type, [date, withdraw, deposit, amount, title])
    return { headerRow, date, title, amount, withdraw, deposit, type }
  }
  return null
}
export function parseMoney(value: string | undefined) {
  if (!value) return 0
  const negative = /^\s*[-−(]/.test(value) || /-\s*$/.test(value)
  const digits = value.replace(/[^\d.]/g, '')
  if (!digits) return 0
  const amount = Math.round(Number(digits))
  return Number.isFinite(amount) ? (negative ? -amount : amount) : 0
}
export function parseLooseDate(value: string | undefined, fallbackYear: string) {
  if (!value) return ''
  const text = value.trim()
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    // 엑셀 날짜 일련번호
    const serial = Math.floor(Number(text))
    if (serial > 30000 && serial < 80000) return localDate(new Date(Date.UTC(1899, 11, 30 + serial, 12)))
  }
  const compact = text.match(/^(20\d{2})(\d{2})(\d{2})/)
  if (compact) {
    const date = `${compact[1]}-${compact[2]}-${compact[3]}`
    return validDate(date) ? date : ''
  }
  const full = text.match(/(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)
  const short = text.match(/^(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)
  let date = ''
  if (full) {
    const year = full[1].length === 2 ? `20${full[1]}` : full[1]
    date = `${year}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`
  } else if (short) date = `${fallbackYear}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`
  return validDate(date) ? date : ''
}
export interface CsvResult {
  rows: ImportedRow[]
  skipped: number
}
export function csvRows(rows: string[][], mapping: CsvMapping, today = localDate()): CsvResult {
  const body = rows.slice(mapping.headerRow + 1)
  const signed =
    mapping.amount >= 0 && mapping.withdraw < 0 && body.some((r) => parseMoney(r[mapping.amount]) < 0)
  const result: ImportedRow[] = []
  let skipped = 0
  for (const r of body) {
    const date = parseLooseDate(r[mapping.date], today.slice(0, 4))
    const type = mapping.type >= 0 ? r[mapping.type] || '' : ''
    let amount = 0
    let kind: ImportedRow['kind'] = 'expense'
    if (mapping.withdraw >= 0) {
      const out = Math.abs(parseMoney(r[mapping.withdraw]))
      const income = mapping.deposit >= 0 ? Math.abs(parseMoney(r[mapping.deposit])) : 0
      amount = out || income
      kind = out ? 'expense' : 'income'
    } else {
      const value = parseMoney(r[mapping.amount])
      amount = Math.abs(value)
      kind = signed ? (value < 0 ? 'expense' : 'income') : /입금/.test(type) ? 'income' : 'expense'
    }
    if (!date || date > today || !amount || !Number.isSafeInteger(amount) || /취소|거절|실패/.test(type)) {
      if (r.some(Boolean) && !/합계|총계|소계/.test(r.join(''))) skipped++
      continue
    }
    const title = (mapping.title >= 0 ? r[mapping.title] : '')?.trim().slice(0, 60) || '내역 확인 필요'
    result.push({ title, amount, date, kind, category: guessCategory(title) })
  }
  return { rows: result, skipped }
}

/* ─────────────────────── 결제 알림 ─────────────────────── */

export interface PaymentNotification {
  /** 기기에서 알림마다 부여한 키 (같은 알림이 두 번 전달되어도 한 번만 처리) */
  key: string
  packageName: string
  title: string
  text: string
  postedAt: number
}
const creditCardIssuer = /(신한|KB국민|국민|삼성|현대|롯데|우리|하나|BC|비씨|NH|농협|씨티|IBK)\s*카드/i
const moneyPattern = /(\d{1,3}(?:,\d{3})+|\d+)\s*원/g
/**
 * 카드사·은행 결제 알림(푸시, 문자, 알림톡)에서 거래를 추출한다.
 * 결제·출금·입금이 아닌 알림, 광고, 승인 취소는 null을 돌려준다.
 */
export function parsePaymentNotification(n: PaymentNotification): ImportedRow | null {
  const raw = `${n.title}\n${n.text}`.replace(/\r/g, '')
  if (/광고|이벤트|혜택\s*안내|쿠폰|인증번호|수신거부/.test(raw)) return null
  if (/취소|거절|실패|한도\s*초과/.test(raw)) return null
  if (!/승인|결제|출금|입금|사용|이체|체크/.test(raw)) return null
  let amount = 0
  let amountText = ''
  for (const match of raw.matchAll(moneyPattern)) {
    const before = raw.slice(Math.max(0, (match.index ?? 0) - 6), match.index)
    if (/누적|잔액|한도|포인트|적립|가능/.test(before)) continue
    amount = Number(match[1].replace(/,/g, ''))
    amountText = match[0]
    break
  }
  if (!amount || !Number.isSafeInteger(amount)) return null
  const posted = new Date(n.postedAt)
  const postedDate = localDate(posted)
  let date = postedDate
  const md = raw.match(/(?:^|[^\d])(\d{1,2})[/.](\d{1,2})(?:\s|$|\(|[^\d])/)
  if (md) {
    let candidate = `${postedDate.slice(0, 4)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`
    if (validDate(candidate) && candidate > postedDate)
      candidate = `${Number(postedDate.slice(0, 4)) - 1}${candidate.slice(4)}`
    if (validDate(candidate)) date = candidate
  }
  const income = /입금/.test(raw) && !/출금|승인|결제/.test(raw)
  const method: ImportedRow['method'] =
    !income && creditCardIssuer.test(raw) && /승인|일시불|할부/.test(raw) && !/체크/.test(raw)
      ? 'card'
      : 'cash'
  // 금액 · 일시 · 카드번호 · 이름 마스킹 · 누적/잔액 문구를 지운 나머지에서 가맹점명을 찾는다.
  const stripped = raw
    .replace(/(누적|잔액|한도|포인트|적립)[^\n|]*/g, '\n')
    .replace(amountText, '\n')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\d{1,2}[/.]\d{1,2}(\s*\d{1,2}:\d{2})?/g, '\n')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, '\n')
    .replace(/[가-힣A-Z]\*+[가-힣A-Z]?님?/g, ' ')
    .replace(/\(?\d{3,4}\)?\*?/g, ' ')
    .replace(/일시불|할부\s*\d*\s*개월?|\d+개월/g, ' ')
    .replace(creditCardIssuer, ' ')
    .replace(/(체크|신용)?카드|은행|뱅크|승인|결제\s*완료|결제|출금|입금|사용|이체|완료|알림|web발신/gi, ' ')
  const parts = stripped
    .split(/\n|\||·/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 2 && /[가-힣A-Za-z]/.test(p))
  const afterTime = raw.search(/\d{1,2}:\d{2}/) >= 0
  const title = (afterTime ? parts[parts.length - 1] : parts[0]) || (income ? '입금' : '결제 알림 확인 필요')
  return {
    title: title.slice(0, 60),
    amount,
    date,
    kind: income ? 'income' : 'expense',
    method,
    category: income ? '기타' : guessCategory(title),
    externalId: `noti:${n.key}`,
  }
}

/* ─────────────────────── 계좌 연동 ─────────────────────── */

/** 계좌 연동 서버(프록시)의 응답 형식. docs/bank-sync.md 참고 */
export interface BankSyncResponse {
  transactions: Array<{
    id: string
    date: string
    title: string
    amount: number
    direction: 'out' | 'in'
    method?: 'cash' | 'card'
  }>
}
export function bankRows(value: unknown, today = localDate()): ImportedRow[] {
  const list = (value as BankSyncResponse | null)?.transactions
  if (!Array.isArray(list)) throw new Error('계좌 연동 응답 형식이 올바르지 않아요.')
  return list.flatMap((t) => {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !validDate(t.date) ||
      t.date > today ||
      typeof t.title !== 'string' ||
      !Number.isSafeInteger(t.amount) ||
      t.amount <= 0 ||
      !['out', 'in'].includes(t.direction)
    )
      return []
    const title = t.title.trim().slice(0, 60) || '계좌 거래'
    return [
      {
        title,
        amount: t.amount,
        date: t.date,
        kind: t.direction === 'in' ? ('income' as const) : ('expense' as const),
        method: t.method === 'card' ? ('card' as const) : ('cash' as const),
        category: t.direction === 'in' ? ('기타' as const) : guessCategory(title),
        externalId: `bank:${t.id}`.slice(0, 300),
      },
    ]
  })
}

/* ─────────────────────── 자동 등록 ─────────────────────── */

export interface IngestResult {
  state: AppState
  added: number
  queued: number
  ignored: number
}
/**
 * 알림·계좌 연동처럼 사용자가 한 건씩 보지 않는 경로의 자동 등록.
 * - 같은 알림/거래 ID가 이미 처리됐으면 조용히 건너뛴다.
 * - 다른 경로(캡처, CSV, 직접 입력)로 이미 등록된 것 같은 거래는 등록하지 않고 확인 대기함(inbox)에 넣는다.
 */
export function autoIngest(
  state: AppState,
  rows: ImportedRow[],
  source: PendingImport['source'],
): IngestResult {
  let next = state
  let added = 0
  let queued = 0
  let ignored = 0
  const inbox = [...(state.inbox || [])]
  for (const row of rows) {
    if (
      row.externalId &&
      (next.transactions.some((t) => t.externalId === row.externalId) ||
        inbox.some((i) => i.externalId === row.externalId))
    ) {
      ignored++
      continue
    }
    const pending: PendingImport = {
      id: uid(),
      title: row.title,
      amount: row.amount,
      date: row.date,
      category: row.category || guessCategory(row.title),
      kind: row.kind,
      method: row.method || 'cash',
      source,
      externalId: row.externalId,
    }
    if (findDuplicates(next.transactions, row).length) {
      inbox.push(pending)
      queued++
      continue
    }
    try {
      next = addTransaction(next, { ...pending, source })
      added++
    } catch {
      inbox.push(pending)
      queued++
    }
  }
  return { state: { ...next, inbox }, added, queued, ignored }
}
