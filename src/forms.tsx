import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  Plus,
  Sparkles,
  Camera,
  LoaderCircle,
  Trash2,
  CalendarDays,
  ShieldCheck,
  Wallet,
  ChevronLeft,
} from 'lucide-react'
import {
  addDays,
  addTransaction,
  budget,
  categories,
  dateLabel,
  emptyState,
  estimateFromHistory,
  isDuplicate,
  localDate,
  parseCaptureText,
  parsePlan,
  removeTransaction,
  uid,
  validDate,
  won,
  type AppState,
  type Category,
  type Fixed,
  type Plan,
  type Profile,
  type Transaction,
  type TransactionKind,
} from './domain'
import { Amount, Brand, Button, ErrorText, Field, MoneyInput } from './ui'

export function ProfileForm({
  state,
  onSave,
  onboarding = false,
  onDemo,
}: {
  state?: AppState
  onSave: (state: AppState) => void
  onboarding?: boolean
  onDemo?: () => void
}) {
  const [profile, setProfile] = useState<Profile>(state?.profile || emptyState().profile)
  const [fixed, setFixed] = useState<Fixed[]>(state?.fixed || [])
  const [step, setStep] = useState(onboarding ? 0 : 3)
  const [error, setError] = useState('')
  const update = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))
  const validate = () => {
    if (!profile.name.trim()) return '어떻게 불러드릴까요? 이름을 입력해주세요.'
    if (!validDate(profile.incomeDate) || profile.incomeDate <= localDate())
      return '다음 수입일을 오늘 이후로 설정해주세요. 오늘 입금된 돈은 현재 잔액에 포함해주세요.'
    if (fixed.some((f) => !f.title.trim() || f.amount <= 0 || !validDate(f.date)))
      return '고정지출의 이름, 금액, 납부일을 모두 입력해주세요.'
    return ''
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const issue = validate()
    setError(issue)
    if (issue) return
    onSave({ ...(state || emptyState()), profile: { ...profile, name: profile.name.trim() }, fixed })
  }
  if (onboarding && step === 0)
    return (
      <div className="welcome">
        <Brand />
        <div className="welcome-heading">
          <span className="eyebrow">약속은 지키고, 오늘은 가볍게.</span>
          <h1>
            그래서 오늘,
            <br />
            얼마까지
            <br />
            <span>써도 될까?</span>
          </h1>
          <p>
            월세도, 주말 약속도 미리 빼두고
            <br />
            진짜 내 생활비만 알려드려요.
          </p>
        </div>
        <div className="wallet-art" aria-hidden="true">
          <div className="paper paper-back" />
          <div className="paper paper-front">
            <span>오늘의 여유</span>
            <strong>
              22,000<span>원</span>
            </strong>
            <div className="paper-rule" />
            <small>지킬 돈은 이미 챙겨뒀어요.</small>
          </div>
          <div className="wallet-body">
            <Brand />
            <span>마음 편히, flex.</span>
          </div>
          <span className="art-star">✳</span>
        </div>
        <div className="welcome-actions">
          <Button onClick={() => setStep(1)}>
            내 생활비 알아보기 <ArrowRight size={18} />
          </Button>
          <Button variant="quiet" onClick={onDemo}>
            먼저 둘러볼게요
          </Button>
          <p className="privacy-note">가입 없이 시작 · 이 기기에만 저장</p>
        </div>
      </div>
    )
  return (
    <form className="form-stack" onSubmit={submit}>
      {onboarding && (
        <>
          <div className="onboarding-top">
            <button
              type="button"
              className="icon-button"
              onClick={() => setStep(step - 1)}
              aria-label="이전 단계"
            >
              <ChevronLeft />
            </button>
            <span>{step} / 3</span>
          </div>
          <div className="step-track">
            {[1, 2, 3].map((n) => (
              <i key={n} className={step >= n ? 'active' : ''} />
            ))}
          </div>
          <div className="form-intro">
            <span className="intro-icon">
              {step === 1 ? <Wallet /> : step === 2 ? <CalendarDays /> : <ShieldCheck />}
            </span>
            <h1>
              {step === 1 ? (
                <>
                  지금 쓸 수 있는 돈,
                  <br />
                  여기서 시작해요.
                </>
              ) : step === 2 ? (
                <>
                  나갈 돈은
                  <br />
                  미리 챙겨둘게요.
                </>
              ) : (
                <>
                  이 돈만큼은
                  <br />꼭 지켜주세요.
                </>
              )}
            </h1>
            <p>
              {step === 1
                ? '다음 수입 전까지 사용할 계좌 잔액을 알려주세요.'
                : step === 2
                  ? '이번 구간에 아직 결제되지 않은 비용만 넣어주세요.'
                  : '잔액 안에 포함된 비상금과 카드값을 따로 확보해요.'}
            </p>
          </div>
        </>
      )}
      {(!onboarding || step === 1) && (
        <>
          <Field label="이름">
            <input
              maxLength={20}
              required
              value={profile.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="어떻게 불러드릴까요?"
            />
          </Field>
          <Field
            label="현재 사용 가능 잔액"
            hint="보호할 비상금도 포함한 잔액이에요. 이미 출금된 금액은 넣지 않아요."
          >
            <MoneyInput value={profile.balance} onChange={(n) => update({ balance: n })} />
          </Field>
          <div className="form-columns">
            <Field label="다음 수입일">
              <input
                type="date"
                required
                min={addDays(localDate(), 1)}
                value={profile.incomeDate}
                onChange={(e) => update({ incomeDate: e.target.value })}
              />
            </Field>
            <Field label="예정 수입액">
              <MoneyInput value={profile.incomeAmount} onChange={(n) => update({ incomeAmount: n })} />
            </Field>
          </div>
          <p className="info-box">예정 수입은 미리 더하지 않아요. 실제 입금 후 ‘수입’으로 기록해주세요.</p>
        </>
      )}
      {(!onboarding || step === 2) && (
        <>
          <div className="section-heading">
            <h3>미납 고정지출</h3>
            <span>{fixed.length}개</span>
          </div>
          {fixed.map((f, index) => (
            <div className="fixed-form" key={f.id}>
              <div className="form-columns">
                <Field label={`고정지출 ${index + 1}`}>
                  <input
                    required
                    maxLength={40}
                    value={f.title}
                    placeholder="예: 월세"
                    onChange={(e) =>
                      setFixed((items) =>
                        items.map((item) => (item.id === f.id ? { ...item, title: e.target.value } : item)),
                      )
                    }
                  />
                </Field>
                <button
                  type="button"
                  className="icon-button remove-fixed"
                  disabled={!!state?.transactions.some((t) => t.fixedId === f.id)}
                  onClick={() => setFixed((items) => items.filter((item) => item.id !== f.id))}
                  aria-label={`${f.title || '고정지출'} 삭제`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="form-columns">
                <Field label="금액">
                  <MoneyInput
                    min={1}
                    required
                    value={f.amount}
                    onChange={(amount) =>
                      setFixed((items) =>
                        items.map((item) => (item.id === f.id ? { ...item, amount } : item)),
                      )
                    }
                  />
                </Field>
                <Field label="납부일">
                  <input
                    required
                    type="date"
                    value={f.date}
                    onChange={(e) =>
                      setFixed((items) =>
                        items.map((item) => (item.id === f.id ? { ...item, date: e.target.value } : item)),
                      )
                    }
                  />
                </Field>
              </div>
              {state?.transactions.some((t) => t.fixedId === f.id) && (
                <small>연결된 거래가 있어 삭제할 수 없어요. 새 구간에는 새 항목을 추가해주세요.</small>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setFixed((items) => [
                ...items,
                { id: uid(), title: '', amount: 0, date: addDays(localDate(), 1) },
              ])
            }
          >
            <Plus size={17} />
            고정지출 추가
          </Button>
          <p className="field-hint">지급이 끝난 항목은 거래 기록에 연결하면 확보액에서 빠져요.</p>
        </>
      )}
      {(!onboarding || step === 3) && (
        <>
          <Field label="보호할 저축 · 비상금" hint="현재 잔액 안에서 이번 수입 구간에 보호할 총액이에요.">
            <MoneyInput value={profile.protectedAmount} onChange={(n) => update({ protectedAmount: n })} />
          </Field>
          <Field label="보호 금액 검토 주기">
            <select
              value={profile.protectionCycle}
              onChange={(e) => update({ protectionCycle: e.target.value as Profile['protectionCycle'] })}
            >
              <option>이번 구간</option>
              <option>매주</option>
              <option>매달</option>
            </select>
          </Field>
          <p className="field-hint">주기는 메모로 보관해요. 자동 반복 차감 없이 다음 구간에 직접 확인해요.</p>
          <Field label="아직 내지 않은 카드 이용액" hint="이미 결제한 카드대금은 제외해주세요.">
            <MoneyInput
              min={state ? -1e12 : 0}
              value={profile.cardOutstanding}
              onChange={(n) => update({ cardOutstanding: n })}
            />
          </Field>
          <div className="setup-summary">
            <span>현재 입력 기준 하루 생활비</span>
            <strong>
              <Amount value={budget({ ...(state || emptyState()), profile, fixed }).daily} />
            </strong>
            <small>확정된 계획과 미납 비용을 반영한 금액</small>
          </div>
        </>
      )}
      <ErrorText message={error} />
      {onboarding && step < 3 ? (
        <Button
          onClick={() => {
            if (step === 1 && (!profile.name.trim() || profile.incomeDate <= localDate())) {
              setError('이름과 오늘 이후의 수입일을 입력해주세요.')
              return
            }
            if (step === 2 && fixed.some((f) => !f.title.trim() || f.amount <= 0 || !validDate(f.date))) {
              setError('고정지출 항목을 모두 입력하거나 삭제해주세요.')
              return
            }
            setError('')
            setStep(step + 1)
            window.scrollTo(0, 0)
          }}
        >
          다음 <ArrowRight size={17} />
        </Button>
      ) : (
        <Button type="submit">
          {onboarding ? '내 생활비 확인하기' : '예산 설정 저장'} <Check size={17} />
        </Button>
      )}
    </form>
  )
}

export function PlanForm({
  state,
  initial,
  onSave,
}: {
  state: AppState
  initial?: Plan
  onSave: (plan: Plan) => void
}) {
  const [plan, setPlan] = useState<Plan>(
    initial || { id: uid(), title: '', amount: 0, date: '', category: '기타', confirmed: true, note: '' },
  )
  const [mode, setMode] = useState<'text' | 'manual'>(initial ? 'manual' : 'text')
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(!!initial)
  const [error, setError] = useState('')
  const [recommend, setRecommend] = useState(false)
  const update = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }))
  const current = budget(state)
  const preview = budget({
    ...state,
    plans: [...state.plans.filter((p) => p.id !== plan.id), { ...plan, confirmed: true }],
  })
  const todayPreview = budget({
    ...state,
    plans: [...state.plans.filter((p) => p.id !== plan.id), { ...plan, date: localDate(), confirmed: true }],
  })
  const estimate = estimateFromHistory(state, plan.category)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (
      !plan.title.trim() ||
      !validDate(plan.date) ||
      plan.date < localDate() ||
      !Number.isSafeInteger(plan.amount) ||
      plan.amount < 0 ||
      (plan.confirmed && plan.amount === 0)
    ) {
      setError('계획 이름, 오늘 이후 날짜, 본인 부담 금액을 확인해주세요.')
      return
    }
    onSave({ ...plan, title: plan.title.trim() })
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="segmented">
        <button type="button" className={mode === 'text' ? 'selected' : ''} onClick={() => setMode('text')}>
          말하듯 입력
        </button>
        <button
          type="button"
          className={mode === 'manual' ? 'selected' : ''}
          onClick={() => {
            setMode('manual')
            setParsed(true)
          }}
        >
          직접 입력
        </button>
      </div>
      {mode === 'text' && (
        <>
          <div className="form-intro compact">
            <span className="intro-icon">
              <Sparkles />
            </span>
            <h2>
              어떤 즐거움을
              <br />
              계획하고 있나요?
            </h2>
            <p>날짜와 내가 쓸 금액을 함께 알려주세요.</p>
          </div>
          <textarea
            aria-label="소비 계획 내용"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="토요일에 데이트, 저녁 먹고 영화 볼 거야. 내 예산은 8만 원!"
            maxLength={500}
          />
          <div className="example-chips">
            {['토요일 데이트 8만 원', '30만 원 모니터 사고 싶어'].map((example) => (
              <button type="button" key={example} onClick={() => setText(example)}>
                {example}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              if (!text.trim()) {
                setError('하고 싶은 일을 먼저 적어주세요.')
                return
              }
              const result = parsePlan(text)
              setPlan((p) => ({ ...p, ...result }))
              setParsed(true)
              setRecommend(!result.date)
              setError('')
            }}
          >
            <Sparkles size={17} />
            계획 초안 만들기
          </Button>
          <p className="field-hint">
            기기 안에서 날짜·금액을 찾는 도우미예요. AI 서버 연결 없이 동작하며, 저장 전에 직접 확인해주세요.
          </p>
        </>
      )}
      {parsed && (
        <>
          <Field label="계획 이름">
            <input
              maxLength={60}
              required
              value={plan.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="예: 토요일 데이트"
            />
          </Field>
          <div className="form-columns">
            <Field label="예정일">
              <input
                required
                type="date"
                min={localDate()}
                value={plan.date}
                onChange={(e) => update({ date: e.target.value })}
              />
            </Field>
            <Field label="카테고리">
              <select
                value={plan.category}
                onChange={(e) => update({ category: e.target.value as Category })}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="내가 부담할 예상 금액" hint="전체 비용이 아닌, 내 지갑에서 나갈 금액만 입력해주세요.">
            <MoneyInput
              required={plan.confirmed}
              min={plan.confirmed ? 1 : 0}
              value={plan.amount}
              onChange={(amount) => update({ amount })}
            />
          </Field>
          {estimate ? (
            <div className="info-box">
              비슷한 계획 {estimate.count}건에서 {won(estimate.low)}~{won(estimate.high)}원을 썼어요.
              <button
                type="button"
                className="text-button"
                onClick={() => update({ amount: estimate.suggested })}
              >
                평균 {won(estimate.suggested)}원 적용
              </button>
            </div>
          ) : (
            <p className="field-hint">
              아직 비교할 정산 기록이 없어요. 인원·활동·분담을 고려해 직접 정해주세요.
            </p>
          )}
          {state.memories.length > 0 && (
            <details className="memory-reminder">
              <summary>내가 기억해 둔 소비 기준 {state.memories.length}개</summary>
              {state.memories.map((m) => (
                <p key={m.id}>
                  <strong>{m.title}</strong>
                  <br />
                  {m.text}
                </p>
              ))}
              <small>메모는 참고용이며 금액을 자동으로 결정하지 않아요.</small>
            </details>
          )}
          <button type="button" className="text-button align-left" onClick={() => setRecommend(!recommend)}>
            <CalendarDays size={16} />
            언제 쓰는 게 좋을까요?
          </button>
          {recommend && (
            <div className="recommendations">
              <h3>선택 가능한 세 가지 시점</h3>
              <p>
                같은 수입 구간 안에서는 날짜를 옮겨도 확보액은 같아요. 적어도 1주일의 여유를 두고 다른 일정도
                함께 확인해보세요.
              </p>
              {[
                {
                  date: localDate(),
                  title: '오늘 확정하기',
                  detail: `바로 계획에 반영해요. 현재 구간 하루 ${won(todayPreview.daily)}원${todayPreview.shortage ? ` · ${won(todayPreview.shortage)}원 부족` : ''}.`,
                },
                {
                  date: addDays(localDate(), 7),
                  title: '일주일 뒤 다시 보기',
                  detail: '충동 구매를 줄일 시간을 확보해요. 다음 수입일 이전이면 예산은 같아요.',
                },
                {
                  date:
                    state.profile.incomeDate > localDate()
                      ? state.profile.incomeDate
                      : addDays(localDate(), 7),
                  title: '다음 수입 이후 검토하기',
                  detail:
                    '이번 생활비를 지킬 수 있어요. 다음 구간의 지출이 아직 없어 구매 가능 여부는 미정이에요.',
                },
              ].map((r, i) => (
                <button
                  type="button"
                  key={i}
                  className="recommendation"
                  onClick={() => update({ date: r.date })}
                >
                  <span>
                    <strong>{r.title}</strong>
                    <small>{r.detail}</small>
                  </span>
                  <span>{dateLabel(r.date).split(' (')[0]}</span>
                </button>
              ))}
              <p>추가 약속은 별도 계획으로 등록하면 계산에 반영돼요.</p>
            </div>
          )}
          <Field label="기억할 내용 (선택)">
            <textarea
              rows={2}
              maxLength={500}
              value={plan.note}
              onChange={(e) => update({ note: e.target.value })}
              placeholder="예: 식사는 반반, 영화는 내가 사기"
            />
          </Field>
          <div className="comparison">
            <span>확정하면 하루 생활비는</span>
            <div>
              <strong>
                {won(current.daily)}
                <small>원</small>
              </strong>
              <ArrowRight size={18} />
              <strong className="green">
                {won(preview.daily)}
                <small>원</small>
              </strong>
            </div>
            {plan.date >= state.profile.incomeDate ? (
              <p>다음 수입 이후 계획은 별도 보관하며 현재 예산에서 차감하지 않아요.</p>
            ) : (
              <p>{won(plan.amount)}원을 계획 예산으로 따로 챙겨둘게요.</p>
            )}
            {preview.shortage > 0 && (
              <p className="danger-text">
                확정 시 {won(preview.shortage)}원 부족해요. 금액이나 시점을 조정해보세요.
              </p>
            )}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={plan.confirmed}
              onChange={(e) => update({ confirmed: e.target.checked })}
            />
            <span>
              예산에 반영하기<small>체크를 해제하면 미확정 계획으로만 보관해요.</small>
            </span>
          </label>
          <Button type="submit">
            {plan.confirmed ? '이 금액으로 계획 확정' : '미확정 계획 저장'} <Check size={17} />
          </Button>
        </>
      )}
      <ErrorText message={error} />
    </form>
  )
}

export function TransactionForm({
  state,
  planId,
  fixedId,
  initial,
  onSave,
}: {
  state: AppState
  planId?: string
  fixedId?: string
  initial?: Transaction
  onSave: (state: AppState) => void
}) {
  const linked = state.plans.find((p) => p.id === planId) || state.fixed.find((f) => f.id === fixedId)
  const [tx, setTx] = useState<Transaction>(
    initial || {
      id: uid(),
      title: linked?.title || '',
      amount: linked?.amount || 0,
      date: localDate(),
      category: planId ? state.plans.find((p) => p.id === planId)!.category : fixedId ? '주거' : '식비',
      kind: 'expense',
      method: 'cash',
      planId,
      fixedId,
      closesItem: !!linked,
      source: 'manual',
    },
  )
  const [error, setError] = useState('')
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const update = (patch: Partial<Transaction>) => setTx((t) => ({ ...t, ...patch }))
  const duplicateState = { ...state, transactions: state.transactions.filter((t) => t.id !== initial?.id) }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (isDuplicate(duplicateState, tx) && !allowDuplicate) {
      setError('같은 날짜·이름·금액의 거래가 있어요. 중복 여부를 확인해주세요.')
      return
    }
    try {
      onSave(addTransaction(initial ? removeTransaction(state, initial.id) : state, tx))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="거래 종류">
        <select
          value={tx.kind}
          onChange={(e) =>
            update({
              kind: e.target.value as TransactionKind,
              planId: undefined,
              fixedId: undefined,
              refundOf: undefined,
              closesItem: false,
            })
          }
        >
          <option value="expense">지출</option>
          <option value="income">수입</option>
          <option value="refund">환불</option>
          <option value="transfer">내 계좌 간 이체</option>
          <option value="card_payment">카드대금 납부</option>
        </select>
      </Field>
      {tx.kind === 'refund' && (
        <Field label="환불할 원래 결제">
          <select
            required
            value={tx.refundOf || ''}
            onChange={(e) => {
              const original = state.transactions.find((t) => t.id === e.target.value)
              update({
                refundOf: e.target.value,
                title: original ? `${original.title} 환불` : '',
                method: original?.method || 'cash',
              })
            }}
          >
            <option value="">원거래 선택</option>
            {state.transactions
              .filter((t) => t.kind === 'expense')
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.date} {t.title} · {won(t.amount)}원
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="거래 이름">
        <input
          required
          maxLength={60}
          value={tx.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="예: 오늘 점심"
        />
      </Field>
      <Field label="금액">
        <MoneyInput required min={1} value={tx.amount} onChange={(amount) => update({ amount })} />
      </Field>
      <div className="form-columns">
        <Field label="거래일">
          <input
            required
            type="date"
            max={localDate()}
            value={tx.date}
            onChange={(e) => update({ date: e.target.value })}
          />
        </Field>
        <Field label="카테고리">
          <select value={tx.category} onChange={(e) => update({ category: e.target.value as Category })}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      {tx.kind === 'expense' && (
        <>
          <Field label="결제 방법">
            <select value={tx.method} onChange={(e) => update({ method: e.target.value as 'cash' | 'card' })}>
              <option value="cash">체크카드 · 계좌 · 현금</option>
              <option value="card">신용카드 (미결제액으로 확보)</option>
            </select>
          </Field>
          <Field label="연결할 예산">
            <select
              value={tx.planId ? `plan:${tx.planId}` : tx.fixedId ? `fixed:${tx.fixedId}` : ''}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(':')
                update({
                  planId: kind === 'plan' ? id : undefined,
                  fixedId: kind === 'fixed' ? id : undefined,
                  closesItem: !!id,
                })
              }}
            >
              <option value="">일반 생활비에서 지출</option>
              <optgroup label="소비 계획">
                {state.plans
                  .filter((p) => p.confirmed)
                  .map((p) => (
                    <option key={p.id} value={`plan:${p.id}`}>
                      {p.title}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="고정지출">
                {state.fixed.map((f) => (
                  <option key={f.id} value={`fixed:${f.id}`}>
                    {f.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          {(tx.planId || tx.fixedId) && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!tx.closesItem}
                onChange={(e) => update({ closesItem: e.target.checked })}
              />
              <span>
                이 지출로 계획 정산 완료
                <small>남은 확보액을 생활비로 돌려줘요. 추가 결제가 남았다면 해제해주세요.</small>
              </span>
            </label>
          )}
        </>
      )}
      {tx.kind === 'card_payment' && (
        <p className="info-box">
          현재 미결제 카드액 {won(state.profile.cardOutstanding)}원. 납부액만큼 잔액과 미결제액을 함께 줄여
          이중 차감을 막아요.
        </p>
      )}
      {tx.kind === 'transfer' && (
        <p className="info-box">등록한 계좌들 사이의 이동으로 기록하며, 총 잔액과 소비액을 바꾸지 않아요.</p>
      )}
      {tx.kind === 'income' && (
        <p className="info-box">
          실제 입금액을 현재 잔액에 더해요. 수입일이 지났다면 내 예산에서 다음 수입일도 변경해주세요.
        </p>
      )}
      {isDuplicate(duplicateState, tx) && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={allowDuplicate}
            onChange={(e) => setAllowDuplicate(e.target.checked)}
          />
          <span>기존 내역과 다른 거래가 맞아요</span>
        </label>
      )}
      <ErrorText message={error} />
      <Button type="submit">
        거래 반영하기 <Check size={17} />
      </Button>
    </form>
  )
}

type Candidate = {
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
}
export function CaptureForm({ state, onSave }: { state: AppState; onSave: (state: AppState) => void }) {
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Candidate[]>([])
  const [date, setDate] = useState(addDays(localDate(), -1))
  const [confirmed, setConfirmed] = useState(false)
  const worker = useRef<{ terminate: () => Promise<unknown> } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      void worker.current?.terminate()
    }
  }, [])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const candidates = (content: string) =>
    setRows(
      parseCaptureText(content, date).map((r) => ({
        ...r,
        id: uid(),
        selected: !isDuplicate(state, r),
        category: '기타',
        method: 'cash',
        link: '',
        closesItem: false,
        kind: 'expense',
      })),
    )
  const recognize = async (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
      setError('12MB 이하의 이미지 파일을 선택해주세요.')
      return
    }
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    setError('')
    setProgress(0)
    setRows([])
    setConfirmed(false)
    try {
      const { createWorker } = await import('tesseract.js')
      if (!alive.current) return
      const instance = await createWorker('kor+eng', 1, {
        logger: (m) => {
          if (alive.current && m.status === 'recognizing text') setProgress(Math.round(m.progress * 100))
        },
      })
      worker.current = instance
      if (!alive.current) {
        await instance.terminate()
        return
      }
      const result = await instance.recognize(file)
      if (alive.current) {
        setText(result.data.text)
        candidates(result.data.text)
        if (!parseCaptureText(result.data.text, date).length)
          setError('거래를 찾지 못했어요. 아래 인식 문자를 수정하거나 직접 후보를 추가해주세요.')
      }
      await instance.terminate()
      worker.current = null
    } catch {
      if (alive.current)
        setError('문자 인식을 완료하지 못했어요. 첫 인식에는 인터넷이 필요해요. 내역을 직접 입력해도 돼요.')
      await worker.current?.terminate().catch(() => {})
      worker.current = null
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const update = (id: string, patch: Partial<Candidate>) =>
    setRows((items) => items.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const save = () => {
    try {
      let next = state
      const selected = rows.filter((r) => r.selected)
      if (!selected.length) throw new Error('반영할 거래를 선택해주세요.')
      if (!confirmed) throw new Error('날짜·금액·거래 종류와 중복을 확인해주세요.')
      for (const r of selected) {
        const [kind, id] = r.link.split(':')
        next = addTransaction(next, {
          id: r.id,
          title: r.title,
          amount: r.amount,
          date: r.date,
          category: r.category,
          kind: r.kind,
          method: r.method,
          planId: r.kind === 'expense' && kind === 'plan' ? id : undefined,
          fixedId: r.kind === 'expense' && kind === 'fixed' ? id : undefined,
          closesItem: r.closesItem,
          source: 'capture',
        })
      }
      onSave(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="form-stack">
      <p className="intro-copy">
        토스·카카오페이 등의 내역을 캡처해 올려주세요. 원본은 이 화면을 닫으면 보관하지 않아요.
      </p>
      <Field label="날짜가 인식되지 않을 때 사용할 거래일">
        <input type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className={`upload-zone ${busy ? 'disabled' : ''}`}>
        <input
          aria-label="거래 캡처 이미지 선택"
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void recognize(e.target.files[0])
            e.target.value = ''
          }}
        />
        {busy ? <LoaderCircle className="spin" size={28} /> : <Camera size={28} />}
        <strong>{busy ? `글자를 읽고 있어요 · ${progress}%` : '캡처 이미지 선택'}</strong>
        <span>{busy ? '처음에는 한국어 인식 자료를 준비해요.' : 'JPG, PNG 등 이미지 · 최대 12MB'}</span>
      </label>
      {preview && <img className="capture-preview" src={preview} alt="확인 중인 거래내역 캡처" />}
      <p className="field-hint">
        이미지는 외부 서버로 보내지 않아요. 인식 엔진과 언어 자료만 인터넷에서 내려받아요. 불확실한 결과는
        직접 고쳐주세요.
      </p>
      <details>
        <summary>인식 문자 확인 · 직접 붙여넣기</summary>
        <textarea
          rows={5}
          aria-label="인식된 거래 문자"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'2026.09.28\n동네 커피 4,500원\n점심 9,500원'}
        />
        <Button variant="secondary" disabled={busy} onClick={() => candidates(text)}>
          이 문자로 후보 다시 만들기
        </Button>
      </details>
      {rows.map((r, index) => (
        <div className="candidate" key={r.id}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={r.selected}
              onChange={(e) => update(r.id, { selected: e.target.checked })}
            />
            <strong>거래 후보 {index + 1}</strong>
            {isDuplicate(state, r) && <span className="badge amber">중복 의심</span>}
          </label>
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
        onClick={() =>
          setRows((items) => [
            ...items,
            {
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
            },
          ])
        }
      >
        <Plus size={16} />
        거래 후보 직접 추가
      </Button>
      {rows.length > 0 && (
        <>
          <label className="check-row">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              날짜·금액·중복과 거래 구분을 확인했어요
              <small>환불과 카드대금 납부는 직접 입력 메뉴에서 원거래에 맞게 등록해주세요.</small>
            </span>
          </label>
          <Button disabled={busy || !confirmed} onClick={save}>
            선택한 {rows.filter((r) => r.selected).length}건 반영하기
          </Button>
        </>
      )}
      <ErrorText message={error} />
    </div>
  )
}
