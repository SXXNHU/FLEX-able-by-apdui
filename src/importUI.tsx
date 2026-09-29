import { useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  addTransaction,
  categories,
  dateLabel,
  findDuplicates,
  localDate,
  sourceLabels,
  uid,
  won,
  type AppState,
  type Category,
  type DuplicateMatch,
  type PendingImport,
  type Transaction,
  type TransactionSource,
} from './domain'
import {
  bankRows,
  csvRows,
  decodeCsv,
  detectCsvMapping,
  guessCategory,
  parseCsv,
  type CsvMapping,
  type ImportedRow,
} from './imports'
import { Button, ErrorText, Field, MoneyInput } from './ui'

export type Candidate = {
  id: string
  title: string
  amount: number
  date: string
  selected: boolean
  category: Category
  method: 'cash' | 'card'
  link: string
  closesItem: boolean
  kind: 'expense' | 'income' | 'transfer'
  externalId?: string
}
export function toCandidates(rows: ImportedRow[], method: 'cash' | 'card' = 'cash'): Candidate[] {
  return rows.map((r) => ({
    id: uid(),
    title: r.title,
    amount: r.amount,
    date: r.date,
    selected: true,
    category: r.category || guessCategory(r.title),
    method: r.kind === 'expense' ? r.method || method : 'cash',
    link: '',
    closesItem: false,
    kind: r.kind,
    externalId: r.externalId,
  }))
}
export function blankCandidate(date: string): Candidate {
  return {
    id: uid(),
    title: '',
    amount: 0,
    date,
    selected: true,
    category: '기타',
    method: 'cash',
    link: '',
    closesItem: false,
    kind: 'expense',
  }
}
function asTransaction(r: Candidate, source: TransactionSource): Transaction {
  const [kind, id] = r.link.split(':')
  return {
    id: r.id,
    title: r.title.trim(),
    amount: r.amount,
    date: r.date,
    category: r.category,
    kind: r.kind,
    method: r.kind === 'expense' ? r.method : 'cash',
    planId: r.kind === 'expense' && kind === 'plan' ? id : undefined,
    fixedId: r.kind === 'expense' && kind === 'fixed' ? id : undefined,
    closesItem: r.kind === 'expense' && !!r.link && r.closesItem,
    source,
    externalId: r.externalId,
  }
}
/** 이미 등록된 거래, 또는 같은 파일 안의 앞선 후보와 겹치는지 */
function duplicateMap(state: AppState, rows: Candidate[], source: TransactionSource) {
  const map = new Map<string, DuplicateMatch[]>()
  const earlier: Transaction[] = []
  for (const r of rows) {
    const tx = asTransaction(r, source)
    const found = [
      ...findDuplicates(state.transactions, tx),
      ...(r.selected ? findDuplicates(earlier, tx).filter((m) => m.level === 'exact') : []),
    ]
    if (found.length) map.set(r.id, found)
    if (r.selected) earlier.push(tx)
  }
  return map
}
function DuplicateNote({ state, matches }: { state: AppState; matches: DuplicateMatch[] }) {
  const m = matches[0]
  const inBatch = !state.transactions.some((t) => t.id === m.tx.id)
  return (
    <p className="duplicate-note">
      <AlertTriangle size={14} />
      {inBatch
        ? '이 목록 안에 같은 거래가 한 번 더 있어요.'
        : `이미 등록됨: ${m.tx.title} · ${won(m.tx.amount)}원 · ${dateLabel(m.tx.date)} (${sourceLabels[m.tx.source]})`}
    </p>
  )
}

export function CandidateList({
  state,
  rows,
  setRows,
  source,
  busy = false,
  fallbackDate,
  onSave,
}: {
  state: AppState
  rows: Candidate[]
  setRows: (update: (rows: Candidate[]) => Candidate[]) => void
  source: TransactionSource
  busy?: boolean
  fallbackDate: string
  onSave: (next: AppState) => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const duplicates = duplicateMap(state, rows, source)
  const selected = rows.filter((r) => r.selected)
  const selectedDuplicates = selected.filter((r) => duplicates.has(r.id))
  const update = (id: string, patch: Partial<Candidate>) => {
    setAsking(false)
    setRows((items) => items.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const commit = (items: Candidate[]) => {
    try {
      if (!items.length) throw new Error('반영할 거래를 선택해주세요.')
      let next = state
      for (const r of items) next = addTransaction(next, asTransaction(r, source))
      onSave(next)
    } catch (e) {
      setAsking(false)
      setError((e as Error).message)
    }
  }
  const save = () => {
    setError('')
    if (!selected.length) return setError('반영할 거래를 선택해주세요.')
    if (!confirmed) return setError('날짜·금액·거래 종류를 확인해주세요.')
    if (selectedDuplicates.length) return setAsking(true)
    commit(selected)
  }
  return (
    <>
      {rows.length > 1 && (
        <div className="candidate-toolbar">
          <span>
            후보 {rows.length}건 · 선택 {selected.length}건
            {duplicates.size > 0 && <em> · 중복 의심 {duplicates.size}건</em>}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              const all = rows.every((r) => r.selected)
              setRows((items) => items.map((r) => ({ ...r, selected: !all })))
            }}
          >
            {rows.every((r) => r.selected) ? '전체 해제' : '전체 선택'}
          </button>
        </div>
      )}
      {rows.map((r, index) => (
        <div className={`candidate ${duplicates.has(r.id) ? 'duplicate' : ''}`} key={r.id}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={r.selected}
              onChange={(e) => update(r.id, { selected: e.target.checked })}
            />
            <strong>거래 후보 {index + 1}</strong>
            {duplicates.has(r.id) && <span className="badge amber">중복 의심</span>}
          </label>
          {duplicates.has(r.id) && <DuplicateNote state={state} matches={duplicates.get(r.id)!} />}
          <Field label="상호 · 이름">
            <input value={r.title} maxLength={60} onChange={(e) => update(r.id, { title: e.target.value })} />
          </Field>
          <div className="form-columns">
            <Field label="금액">
              <MoneyInput value={r.amount} onChange={(amount) => update(r.id, { amount })} />
            </Field>
            <Field label="거래일">
              <input
                type="date"
                max={localDate()}
                value={r.date}
                onChange={(e) => update(r.id, { date: e.target.value })}
              />
            </Field>
          </div>
          <div className="form-columns">
            <Field label="거래 구분">
              <select
                value={r.kind}
                onChange={(e) => update(r.id, { kind: e.target.value as Candidate['kind'] })}
              >
                <option value="expense">지출</option>
                <option value="income">입금 · 수입</option>
                <option value="transfer">내 계좌 이체</option>
              </select>
            </Field>
            <Field label="카테고리">
              <select
                value={r.category}
                onChange={(e) => update(r.id, { category: e.target.value as Category })}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          {r.kind === 'expense' && (
            <>
              <Field label="결제 방법">
                <select
                  value={r.method}
                  onChange={(e) => update(r.id, { method: e.target.value as Candidate['method'] })}
                >
                  <option value="cash">계좌 · 체크카드 · 현금</option>
                  <option value="card">신용카드</option>
                </select>
              </Field>
              <Field label="연결할 예산">
                <select value={r.link} onChange={(e) => update(r.id, { link: e.target.value })}>
                  <option value="">일반 생활비</option>
                  {state.plans
                    .filter((p) => p.confirmed)
                    .map((p) => (
                      <option key={p.id} value={`plan:${p.id}`}>
                        {p.title}
                      </option>
                    ))}
                  {state.fixed.map((f) => (
                    <option key={f.id} value={`fixed:${f.id}`}>
                      {f.title}
                    </option>
                  ))}
                </select>
              </Field>
              {r.link && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={r.closesItem}
                    onChange={(e) => update(r.id, { closesItem: e.target.checked })}
                  />
                  <span>이 결제로 계획 정산 완료</span>
                </label>
              )}
            </>
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => setRows((items) => [...items, blankCandidate(fallbackDate)])}
      >
        <Plus size={16} />
        거래 후보 직접 추가
      </Button>
      {rows.length > 0 && (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked)
                setAsking(false)
              }}
            />
            <span>
              날짜·금액·중복과 거래 구분을 확인했어요
              <small>환불과 카드대금 납부는 직접 입력 메뉴에서 원거래에 맞게 등록해주세요.</small>
            </span>
          </label>
          {asking ? (
            <div className="warning-box duplicate-confirm" role="alertdialog" aria-label="중복 거래 확인">
              <p>
                <strong>이미 있는 거래 같아요. 그래도 추가할까요?</strong>
                선택한 {selected.length}건 중 {selectedDuplicates.length}건이 기존 내역과 겹쳐 보여요.
                캡처·CSV·알림으로 같은 결제를 두 번 등록하면 잔액이 두 번 빠져요.
              </p>
              <ul>
                {selectedDuplicates.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    {r.title} · {won(r.amount)}원 · {dateLabel(r.date)}
                  </li>
                ))}
                {selectedDuplicates.length > 5 && <li>외 {selectedDuplicates.length - 5}건</li>}
              </ul>
              {selected.length > selectedDuplicates.length && (
                <Button onClick={() => commit(selected.filter((r) => !duplicates.has(r.id)))}>
                  중복 빼고 {selected.length - selectedDuplicates.length}건만 추가
                </Button>
              )}
              <Button variant="danger" onClick={() => commit(selected)}>
                중복 포함 {selected.length}건 모두 추가
              </Button>
              <Button variant="quiet" onClick={() => setAsking(false)}>
                돌아가서 확인하기
              </Button>
            </div>
          ) : (
            <Button disabled={busy || !confirmed} onClick={save}>
              선택한 {selected.length}건 반영하기
            </Button>
          )}
        </>
      )}
      <ErrorText message={error} />
    </>
  )
}

const columnLabels: Array<[keyof Omit<CsvMapping, 'headerRow'>, string]> = [
  ['date', '날짜 열'],
  ['title', '가맹점 · 내용 열'],
  ['amount', '금액 열 (하나일 때)'],
  ['withdraw', '출금액 열'],
  ['deposit', '입금액 열'],
  ['type', '구분 열 (선택)'],
]
export function CsvForm({ state, onSave }: { state: AppState; onSave: (next: AppState) => void }) {
  const [table, setTable] = useState<string[][]>([])
  const [mapping, setMapping] = useState<CsvMapping | null>(null)
  const [fileName, setFileName] = useState('')
  const [card, setCard] = useState(false)
  const [rows, setRows] = useState<Candidate[]>([])
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState('')
  const build = (data: string[][], map: CsvMapping, asCard: boolean) => {
    const result = csvRows(data, map)
    setRows(toCandidates(result.rows, asCard ? 'card' : 'cash'))
    setSkipped(result.skipped)
    setError(result.rows.length ? '' : '가져올 거래를 찾지 못했어요. 아래에서 열을 직접 지정해주세요.')
  }
  const read = async (file: File) => {
    setError('')
    setRows([])
    try {
      if (/\.xlsx?$/i.test(file.name))
        throw new Error('엑셀 파일은 엑셀에서 “다른 이름으로 저장 → CSV”로 바꾼 뒤 올려주세요.')
      if (file.size > 5e6) throw new Error('5MB 이하 CSV 파일을 선택해주세요.')
      const data = parseCsv(decodeCsv(await file.arrayBuffer()))
      if (!data.length) throw new Error('파일에 내용이 없어요.')
      const detected = detectCsvMapping(data)
      const header = detected ? data[detected.headerRow].join(' ') : ''
      const asCard = /이용하신곳|가맹점|승인/.test(header) && !/잔액|출금/.test(header)
      setFileName(file.name)
      setTable(data)
      setCard(asCard)
      const map = detected || {
        headerRow: 0,
        date: -1,
        title: -1,
        amount: -1,
        withdraw: -1,
        deposit: -1,
        type: -1,
      }
      setMapping(map)
      if (detected) build(data, detected, asCard)
      else setError('날짜·금액 열을 찾지 못했어요. 머리행과 열을 직접 지정해주세요.')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const remap = (patch: Partial<CsvMapping>) => {
    if (!mapping) return
    const next = { ...mapping, ...patch }
    setMapping(next)
    if (next.date >= 0 && (next.amount >= 0 || next.withdraw >= 0)) build(table, next, card)
  }
  const header = mapping ? table[mapping.headerRow] || [] : []
  return (
    <div className="form-stack">
      <p className="intro-copy">
        은행·카드사 앱이나 홈페이지에서 내려받은 거래내역을 CSV로 올려주세요. 파일은 이 기기 안에서만 읽어요.
      </p>
      <label className="upload-zone">
        <input
          aria-label="CSV 파일 선택"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,.xls,.xlsx"
          onChange={(e) => {
            if (e.target.files?.[0]) void read(e.target.files[0])
            e.target.value = ''
          }}
        />
        <FileSpreadsheet size={28} />
        <strong>{fileName || 'CSV 파일 선택'}</strong>
        <span>엑셀에서 CSV로 저장한 파일 · UTF-8, EUC-KR 모두 가능 · 5MB 이하</span>
      </label>
      {mapping && (
        <>
          <details className="csv-mapping" open={!rows.length}>
            <summary>열 지정 확인 {rows.length ? `· ${rows.length}건 인식` : ''}</summary>
            <Field label="머리행 (열 이름이 있는 줄)">
              <select
                value={mapping.headerRow}
                onChange={(e) => remap({ headerRow: Number(e.target.value) })}
              >
                {table.slice(0, 30).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}행: {r.join(' | ').slice(0, 40)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-columns wrap">
              {columnLabels.map(([key, label]) => (
                <Field label={label} key={key}>
                  <select value={mapping[key]} onChange={(e) => remap({ [key]: Number(e.target.value) })}>
                    <option value={-1}>없음</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `${i + 1}번째 열`}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <p className="field-hint">
              출금액 열을 지정하면 금액 열은 쓰지 않아요. 금액 열 하나에 음수가 있으면 음수를 지출로 봐요.
            </p>
          </details>
          <label className="check-row">
            <input
              type="checkbox"
              checked={card}
              onChange={(e) => {
                setCard(e.target.checked)
                setRows((items) =>
                  items.map((r) =>
                    r.kind === 'expense' ? { ...r, method: e.target.checked ? 'card' : 'cash' } : r,
                  ),
                )
              }}
            />
            <span>
              신용카드 이용내역이에요
              <small>지출을 계좌 잔액 대신 미결제 카드액으로 반영해요. 체크카드는 해제해주세요.</small>
            </span>
          </label>
          {skipped > 0 && (
            <p className="field-hint">날짜·금액이 없거나 취소·미래 날짜인 {skipped}행은 제외했어요.</p>
          )}
        </>
      )}
      <ErrorText message={error} />
      {mapping && (
        <CandidateList
          state={state}
          rows={rows}
          setRows={setRows}
          source="csv"
          fallbackDate={localDate()}
          onSave={onSave}
        />
      )}
    </div>
  )
}

/** 자동 등록 중 중복이 의심되어 보류한 거래를 하나씩 확인한다. */
export function InboxReview({
  state,
  onSave,
}: {
  state: AppState
  onSave: (next: AppState, message: string) => void
}) {
  const [error, setError] = useState('')
  const inbox = state.inbox || []
  const without = (id: string) => inbox.filter((i) => i.id !== id)
  const accept = (item: PendingImport) => {
    try {
      const next = addTransaction({ ...state, inbox: without(item.id) }, { ...item, id: uid() })
      onSave(next, '확인한 거래를 추가했어요.')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  if (!inbox.length) return <p className="info-box">확인할 거래가 없어요.</p>
  return (
    <div className="form-stack">
      <p className="intro-copy">
        자동으로 가져온 거래 중 이미 등록된 내역과 같아 보이는 건은 바로 반영하지 않고 여기에 모아뒀어요.
      </p>
      {inbox.map((item) => {
        const match = findDuplicates(state.transactions, item)[0]
        return (
          <div className="candidate duplicate" key={item.id}>
            <div className="inbox-head">
              <span className="badge amber">{sourceLabels[item.source]}</span>
              <strong>
                {item.title} · {won(item.amount)}원
              </strong>
              <small>
                {dateLabel(item.date)} ·{' '}
                {item.kind === 'income' ? '입금' : item.method === 'card' ? '신용카드' : '계좌 결제'}
              </small>
            </div>
            {match ? (
              <DuplicateNote state={state} matches={[match]} />
            ) : (
              <p className="field-hint">겹쳐 보이던 기존 거래가 지금은 없어요.</p>
            )}
            <p className="inbox-question">이거 이미 있는 거래인데 추가하시겠어요?</p>
            <div className="form-columns">
              <Button
                variant="secondary"
                onClick={() => onSave({ ...state, inbox: without(item.id) }, '중복 거래를 버렸어요.')}
              >
                <Trash2 size={16} />
                이미 있어요
              </Button>
              <Button onClick={() => accept(item)}>
                <Check size={16} />
                따로 추가
              </Button>
            </div>
          </div>
        )
      })}
      <ErrorText message={error} />
    </div>
  )
}

/**
 * 계좌 연동 서버(프록시)에서 최근 거래를 불러온다. 금융 API 키는 앱에 넣을 수 없어서 서버를 거친다.
 * 불러온 거래는 바로 반영하지 않고 CSV와 같은 검토 · 중복 확인을 거친다.
 */
export const bankSyncUrl = (import.meta.env.VITE_BANK_SYNC_URL as string | undefined) || ''
export function BankSyncForm({ state, onSave }: { state: AppState; onSave: (next: AppState) => void }) {
  const [rows, setRows] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const since = state.lastBankSync ? state.lastBankSync.slice(0, 10) : state.trackingStart || localDate()
  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const url = new URL(bankSyncUrl)
      url.searchParams.set('from', since)
      url.searchParams.set('to', localDate())
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`계좌 연동 서버가 응답하지 않아요. (${response.status})`)
      const fresh = bankRows(await response.json()).filter(
        (r) => !state.transactions.some((t) => t.externalId === r.externalId),
      )
      setRows(toCandidates(fresh))
      setLoaded(true)
      if (!fresh.length) setError('새로 가져올 거래가 없어요.')
    } catch (e) {
      setError(
        e instanceof TypeError
          ? '계좌 연동 서버에 연결하지 못했어요. 네트워크를 확인해주세요.'
          : (e as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }
  if (!bankSyncUrl)
    return (
      <div className="form-stack">
        <p className="warning-box">
          계좌 연동 서버가 설정되지 않았어요. 금융 마이데이터는 금융위원회 허가를 받은 사업자만 직접 호출할 수
          있어서, CODEF 같은 중계 API를 호출하는 서버를 따로 두고 <code>VITE_BANK_SYNC_URL</code>에 주소를
          넣어야 해요.
        </p>
        <p className="field-hint">
          그전까지는 은행 앱에서 거래내역을 CSV로 내려받아 올리거나, Android 앱의 결제 알림 자동 등록을
          이용해주세요.
        </p>
      </div>
    )
  return (
    <div className="form-stack">
      <p className="intro-copy">
        {since}부터 오늘까지 연결된 계좌·카드의 거래를 불러와요. 이미 가져온 거래는 다시 표시하지 않아요.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => void load()}>
        <RefreshCw size={17} className={busy ? 'spin' : ''} />
        {busy ? '불러오는 중' : loaded ? '다시 불러오기' : '계좌 내역 불러오기'}
      </Button>
      {state.lastBankSync && (
        <p className="field-hint">마지막 업데이트: {new Date(state.lastBankSync).toLocaleString('ko-KR')}</p>
      )}
      <ErrorText message={error} />
      {loaded && rows.length > 0 && (
        <CandidateList
          state={state}
          rows={rows}
          setRows={setRows}
          source="bank"
          busy={busy}
          fallbackDate={localDate()}
          onSave={(next) => onSave({ ...next, lastBankSync: new Date().toISOString() })}
        />
      )}
    </div>
  )
}
