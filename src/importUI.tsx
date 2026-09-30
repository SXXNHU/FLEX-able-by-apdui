import { useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Plus } from 'lucide-react'
import {
  categories,
  dateLabel,
  localDate,
  sourceLabels,
  uid,
  won,
  type Category,
  type Ledger,
} from './domain'
import { decodeCsv } from './imports'
import { ApiError, errorMessage } from './api/client'
import {
  importApi,
  type CandidatesResult,
  type CsvMapping,
  type DuplicateInfo,
  type ImportCandidate,
  type ImportItem,
} from './api/ledger'
import { Button, ErrorText, Field, MoneyInput } from './ui'

/** 화면에서 고칠 수 있는 후보. 중복 정보는 서버가 후보를 만들 때 판정한 값이다. */
export type Candidate = ImportItem & {
  selected: boolean
  link: string
  duplicates: DuplicateInfo[]
  sameAsCandidate: number | null
  alreadyImported: boolean
}
export function toCandidates(rows: ImportCandidate[]): Candidate[] {
  return rows.map((r) => ({
    id: uid(),
    title: r.title,
    amount: r.amount,
    date: r.date,
    category: r.category,
    kind: r.kind,
    method: r.method,
    closesItem: false,
    sourceEventId: r.sourceEventId,
    selected: !r.alreadyImported,
    link: '',
    duplicates: r.duplicates,
    sameAsCandidate: r.sameAsCandidate,
    alreadyImported: r.alreadyImported,
  }))
}
export function blankCandidate(date: string): Candidate {
  return {
    id: uid(),
    title: '',
    amount: 0,
    date,
    category: '기타',
    kind: 'expense',
    method: 'cash',
    closesItem: false,
    selected: true,
    link: '',
    duplicates: [],
    sameAsCandidate: null,
    alreadyImported: false,
  }
}
function toItem(r: Candidate): ImportItem {
  const [kind, id] = r.link.split(':')
  const expense = r.kind === 'expense'
  return {
    id: r.id,
    title: r.title.trim(),
    amount: r.amount,
    date: r.date,
    category: r.category,
    kind: r.kind,
    method: expense ? r.method : 'cash',
    planId: expense && kind === 'plan' ? id : undefined,
    fixedId: expense && kind === 'fixed' ? id : undefined,
    closesItem: expense && !!r.link && r.closesItem,
    sourceEventId: r.sourceEventId,
  }
}
function DuplicateNote({ candidate, index }: { candidate: Candidate; index: number }) {
  const d = candidate.duplicates[0]
  if (candidate.alreadyImported)
    return (
      <p className="duplicate-note">
        <AlertTriangle size={14} />
        이미 가져온 거래예요. 다시 반영하지 않아요.
      </p>
    )
  if (!d && candidate.sameAsCandidate === null) return null
  return (
    <p className="duplicate-note">
      <AlertTriangle size={14} />
      {d
        ? `이미 등록됨: ${d.title} · ${won(d.amount)}원 · ${dateLabel(d.date)} (${sourceLabels[d.source]})`
        : `이 목록의 ${(candidate.sameAsCandidate ?? index) + 1}번 후보와 같은 거래예요.`}
    </p>
  )
}

/**
 * 후보 검토와 반영. 중복의 최종 판정은 서버가 한다. 사용자가 확인하지 않은 중복이 있으면 서버가 거절하고,
 * 그 항목을 "이미 있는 거래 같아요. 그래도 추가할까요?"로 다시 묻는다.
 */
export function CandidateList({
  ledger,
  rows,
  setRows,
  source,
  busy = false,
  fallbackDate,
  onSaved,
}: {
  ledger: Ledger
  rows: Candidate[]
  setRows: (update: (rows: Candidate[]) => Candidate[]) => void
  source: 'csv' | 'capture'
  busy?: boolean
  fallbackDate: string
  onSaved: (count: number) => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [asking, setAsking] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selected = rows.filter((r) => r.selected)
  const flagged = (r: Candidate) => r.duplicates.length > 0 || r.sameAsCandidate !== null
  const update = (id: string, patch: Partial<Candidate>) => {
    setAsking([])
    setRows((items) => items.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const commit = async (items: Candidate[], accept: string[] = []) => {
    setError('')
    if (!items.length) return setError('반영할 거래를 선택해주세요.')
    setSaving(true)
    try {
      const result = await importApi.import(source, items.map(toItem), accept)
      setAsking([])
      onSaved(result.created.length)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_requires_confirmation') {
        setAsking((e.extra.items as string[]) || [])
      } else {
        setAsking([])
        setError(errorMessage(e))
      }
    } finally {
      setSaving(false)
    }
  }
  const save = () => {
    if (!confirmed) return setError('날짜·금액·거래 종류를 확인해주세요.')
    void commit(selected)
  }
  const askingRows = selected.filter((r) => asking.includes(r.id))
  return (
    <>
      {rows.length > 1 && (
        <div className="candidate-toolbar">
          <span>
            후보 {rows.length}건 · 선택 {selected.length}건
            {rows.some(flagged) && <em> · 중복 의심 {rows.filter(flagged).length}건</em>}
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
        <div className={`candidate ${flagged(r) || r.alreadyImported ? 'duplicate' : ''}`} key={r.id}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={r.selected}
              onChange={(e) => update(r.id, { selected: e.target.checked })}
            />
            <strong>거래 후보 {index + 1}</strong>
            {flagged(r) && <span className="badge amber">중복 의심</span>}
          </label>
          <DuplicateNote candidate={r} index={index} />
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
                  {ledger.plans
                    .filter((p) => p.confirmed)
                    .map((p) => (
                      <option key={p.id} value={`plan:${p.id}`}>
                        {p.title}
                      </option>
                    ))}
                  {ledger.fixed.map((f) => (
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
        disabled={busy || saving}
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
                setAsking([])
              }}
            />
            <span>
              날짜·금액·중복과 거래 구분을 확인했어요
              <small>환불과 카드대금 납부는 직접 입력 메뉴에서 원거래에 맞게 등록해주세요.</small>
            </span>
          </label>
          {askingRows.length ? (
            <div className="warning-box duplicate-confirm" role="alertdialog" aria-label="중복 거래 확인">
              <p>
                <strong>이미 있는 거래 같아요. 그래도 추가할까요?</strong>
                선택한 {selected.length}건 중 {askingRows.length}건이 기존 내역과 겹쳐 보여요.
                캡처·CSV·알림으로 같은 결제를 두 번 등록하면 잔액이 두 번 빠져요.
              </p>
              <ul>
                {askingRows.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    {r.title} · {won(r.amount)}원 · {dateLabel(r.date)}
                  </li>
                ))}
                {askingRows.length > 5 && <li>외 {askingRows.length - 5}건</li>}
              </ul>
              {selected.length > askingRows.length && (
                <Button
                  disabled={saving}
                  onClick={() => void commit(selected.filter((r) => !asking.includes(r.id)))}
                >
                  중복 빼고 {selected.length - askingRows.length}건만 추가
                </Button>
              )}
              <Button variant="danger" disabled={saving} onClick={() => void commit(selected, asking)}>
                중복 포함 {selected.length}건 모두 추가
              </Button>
              <Button variant="quiet" onClick={() => setAsking([])}>
                돌아가서 확인하기
              </Button>
            </div>
          ) : (
            <Button disabled={busy || saving || !confirmed || !selected.length} onClick={save}>
              {saving ? '반영하는 중' : `선택한 ${selected.length}건 반영하기`}
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
export function CsvForm({ ledger, onSaved }: { ledger: Ledger; onSaved: (count: number) => void }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<CandidatesResult | null>(null)
  const [rows, setRows] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async (content: string, mapping?: CsvMapping | null, creditCard?: boolean | null) => {
    setBusy(true)
    setError('')
    try {
      const next = await importApi.candidates('csv', { text: content, mapping, creditCard })
      setResult(next)
      setRows(toCandidates(next.candidates))
      if (!next.candidates.length)
        setError(
          next.csv?.detected
            ? '가져올 거래를 찾지 못했어요. 아래에서 열을 직접 지정해주세요.'
            : '날짜·금액 열을 찾지 못했어요. 머리행과 열을 직접 지정해주세요.',
        )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const read = async (file: File) => {
    setError('')
    setRows([])
    setResult(null)
    if (/\.xlsx?$/i.test(file.name))
      return setError('엑셀 파일은 엑셀에서 “다른 이름으로 저장 → CSV”로 바꾼 뒤 올려주세요.')
    if (file.size > 5e6) return setError('5MB 이하 CSV 파일을 선택해주세요.')
    const content = decodeCsv(await file.arrayBuffer())
    if (!content.trim()) return setError('파일에 내용이 없어요.')
    setFileName(file.name)
    setText(content)
    await load(content)
  }
  const mapping = result?.csv?.mapping
  const header = mapping ? result?.csv?.headRows[mapping.headerRow] || [] : []
  const remap = (patch: Partial<CsvMapping>) => {
    if (mapping) void load(text, { ...mapping, ...patch }, result?.csv?.creditCard)
  }
  return (
    <div className="form-stack">
      <p className="intro-copy">
        은행·카드사 앱이나 홈페이지에서 내려받은 거래내역을 CSV로 올려주세요. 파일 내용은 거래 후보를 만드는
        데만 쓰고, 확인한 거래만 저장해요.
      </p>
      <label className={`upload-zone ${busy ? 'disabled' : ''}`}>
        <input
          aria-label="CSV 파일 선택"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,.xls,.xlsx"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void read(e.target.files[0])
            e.target.value = ''
          }}
        />
        <FileSpreadsheet size={28} />
        <strong>{busy ? '거래를 읽고 있어요' : fileName || 'CSV 파일 선택'}</strong>
        <span>엑셀에서 CSV로 저장한 파일 · UTF-8, EUC-KR 모두 가능 · 5MB 이하</span>
      </label>
      {mapping && result?.csv && (
        <>
          <details className="csv-mapping" open={!rows.length}>
            <summary>열 지정 확인 {rows.length ? `· ${rows.length}건 인식` : ''}</summary>
            <Field label="머리행 (열 이름이 있는 줄)">
              <select
                value={mapping.headerRow}
                onChange={(e) => remap({ headerRow: Number(e.target.value) })}
              >
                {result.csv.headRows.map((r, i) => (
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
              checked={result.csv.creditCard}
              disabled={busy}
              onChange={(e) => void load(text, mapping, e.target.checked)}
            />
            <span>
              신용카드 이용내역이에요
              <small>지출을 계좌 잔액 대신 미결제 카드액으로 반영해요. 체크카드는 해제해주세요.</small>
            </span>
          </label>
          {result.skipped > 0 && (
            <p className="field-hint">날짜·금액이 없거나 취소·미래 날짜인 {result.skipped}행은 제외했어요.</p>
          )}
        </>
      )}
      <ErrorText message={error} />
      {result && (
        <CandidateList
          ledger={ledger}
          rows={rows}
          setRows={setRows}
          source="csv"
          busy={busy}
          fallbackDate={localDate()}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

/**
 * 계좌 내역 업데이트. 금융 마이데이터는 허가 사업자만 직접 호출할 수 있어, 서버가 중계 API(예: CODEF)를
 * 호출하는 방식으로 연결할 예정이다. 그전까지는 CSV와 캡처로 가져온다.
 */
export function BankSyncInfo() {
  return (
    <div className="form-stack">
      <p className="warning-box">
        계좌 자동 연동은 아직 연결되지 않았어요. 금융 마이데이터는 금융위원회 허가를 받은 사업자만 직접 호출할
        수 있어서, 서버가 중계 API를 호출하는 방식으로 준비하고 있어요.
      </p>
      <p className="field-hint">
        그전까지는 은행 앱에서 거래내역을 CSV로 내려받아 올리거나 결제내역 캡처를 올려주세요. 이미 등록된
        결제는 추가 전에 한 번 더 물어봐요.
      </p>
    </div>
  )
}
