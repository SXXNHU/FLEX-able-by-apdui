import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Heart,
  Home,
  Landmark,
  ListFilter,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import {
  actualFor,
  addDays,
  addTransaction,
  asDate,
  budget,
  categories,
  dateLabel,
  demoState,
  isClosed,
  isDuplicate,
  localDate,
  parseCalendar,
  remainingFor,
  removeTransaction,
  uid,
  validateState,
  won,
  type AppState,
  type Memory,
  type Plan,
  type Transaction,
} from './domain'
import { Amount, Brand, Button, CategoryIcon, Empty, ErrorText, Field, Row, Sheet } from './ui'
import { CaptureForm, PlanForm, ProfileForm, TransactionForm } from './forms'

const KEY = 'flex-able:state:v1'
type Page = 'home' | 'plans' | 'records' | 'settings'
type Modal =
  | {
      type:
        | 'budget'
        | 'profile'
        | 'capture'
        | 'reconcile'
        | 'notifications'
        | 'calendarImport'
        | 'help'
        | 'reset'
        | 'demoImport'
    }
  | { type: 'plan'; plan?: Plan }
  | { type: 'planDetail'; plan: Plan }
  | { type: 'transaction'; planId?: string; fixedId?: string; initial?: Transaction }
  | { type: 'transactionDetail'; tx: Transaction }
  | { type: 'memory'; memory?: Memory }
  | { type: 'restore'; state: AppState }
function readSaved(): { state: AppState | null; error: string } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { state: null, error: '' }
    const value: unknown = JSON.parse(raw)
    return validateState(value)
      ? { state: value, error: '' }
      : { state: null, error: '저장된 데이터 형식을 확인하지 못했어요. 기존 원본은 유지 중이에요.' }
  } catch {
    return { state: null, error: '기기 저장소를 읽지 못했어요. 브라우저 설정을 확인해주세요.' }
  }
}
export default function App() {
  const [loaded] = useState(readSaved)
  const [state, setState] = useState<AppState | null>(loaded.state)
  const [splash, setSplash] = useState(true)
  const [page, setPage] = useState<Page>('home')
  const [modal, setModal] = useState<Modal | null>(null)
  const [toast, setToast] = useState('')
  const [storageError, setStorageError] = useState(loaded.error)
  const [today, setToday] = useState(localDate())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = (message: string) => {
    setToast(message)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 4500)
  }
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1500)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setToday(localDate()), 30000)
    return () => {
      clearInterval(t)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [page])
  const save = (next: AppState, message = '') => {
    try {
      if (!validateState(next)) throw new Error('입력값을 저장할 수 없어요. 항목을 다시 확인해주세요.')
      localStorage.setItem(KEY, JSON.stringify(next))
      setState(next)
      setStorageError('')
      if (message) notify(message)
      return true
    } catch (error) {
      setStorageError(
        `저장하지 못했어요. ${(error as Error).message} 저장 공간과 브라우저 설정을 확인해주세요.`,
      )
      return false
    }
  }
  const finish = (next: AppState, message: string) => {
    if (save(next, message)) setModal(null)
  }
  useEffect(() => {
    if (!state?.notifications) return
    const check = () => {
      const now = new Date()
      const date = localDate(now)
      const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      if (current < state.notificationTime || state.reconciledDates.includes(date)) return
      try {
        if (sessionStorage.getItem('flex-reminded') === date) return
        sessionStorage.setItem('flex-reminded', date)
      } catch {
        return
      }
      notify('오늘 내역을 확인할 시간이에요. 빠진 소비를 반영하고 정산해주세요.')
      if ('Notification' in window && Notification.permission === 'granted')
        void sendNotification(
          '오늘의 소비를 확인해볼까요?',
          '정산 후 남은 기간의 생활비를 다시 계산해드려요.',
        )
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [state])
  const exportData = () => {
    if (!state) return
    downloadFile(`flex-able-${today}.json`, JSON.stringify(state, null, 2), 'application/json')
    notify('백업 파일을 저장했어요.')
  }
  const restoreFile = async (file: File) => {
    try {
      if (file.size > 5e6) throw new Error('5MB 이하 백업 파일만 불러올 수 있어요.')
      const parsed: unknown = JSON.parse(await file.text())
      if (!validateState(parsed)) throw new Error('flex-able 백업 형식이 아니에요.')
      setModal({ type: 'restore', state: parsed })
    } catch (e) {
      notify((e as Error).message)
    }
  }
  const open = (next: Modal) => setModal(next)
  let content: ReactNode
  if (!state)
    content = (
      <div className="onboarding">
        {storageError ? (
          <div className="recovery">
            <Brand />
            <h1>
              기존 기록을
              <br />
              먼저 확인해주세요.
            </h1>
            <p>{storageError}</p>
            <Button
              variant="secondary"
              onClick={() => {
                try {
                  downloadFile('flex-able-recovery.json', localStorage.getItem(KEY) || '', 'application/json')
                } catch {
                  notify('원본을 읽을 수 없어요.')
                }
              }}
            >
              저장 원본 다운로드
            </Button>
            <Button
              onClick={() => {
                if (confirm('기존 저장 데이터를 지우고 새로 시작할까요? 원본을 먼저 다운로드해주세요.')) {
                  try {
                    localStorage.removeItem(KEY)
                    setStorageError('')
                  } catch {
                    notify('저장소 접근이 차단되어 있어요.')
                  }
                }
              }}
            >
              새로 시작하기
            </Button>
          </div>
        ) : (
          <ProfileForm
            onboarding
            onSave={(next) => {
              save(next, '내 생활비 준비가 끝났어요.')
              setPage('home')
            }}
            onDemo={() => {
              save(demoState(), '예시 데이터로 둘러보고 있어요.')
              setPage('home')
            }}
          />
        )}
      </div>
    )
  else
    content = (
      <>
        <header className="app-header">
          <Brand />
          <button
            className="notification-button icon-button"
            aria-label="알림 확인"
            onClick={() => open({ type: 'notifications' })}
          >
            <Bell size={22} />
            {budget(state, today).provisional && <i />}
          </button>
        </header>
        {state.demo && (
          <div className="demo-banner">
            <span>예시 데이터로 둘러보는 중</span>
            <button onClick={() => open({ type: 'reset' })}>
              내 예산으로 시작 <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        {storageError && (
          <div className="storage-error" role="alert">
            {storageError}
          </div>
        )}
        <main className="main-content" key={page}>
          {page === 'home' ? (
            <HomePage state={state} today={today} open={open} navigate={setPage} />
          ) : page === 'plans' ? (
            <PlansPage state={state} today={today} open={open} />
          ) : page === 'records' ? (
            <RecordsPage state={state} today={today} open={open} />
          ) : (
            <SettingsPage
              state={state}
              open={open}
              onExport={exportData}
              onRestore={restoreFile}
              save={save}
              notify={notify}
            />
          )}
        </main>
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {(
            [
              { id: 'home', label: '오늘', icon: Home },
              { id: 'plans', label: '소비 계획', icon: CalendarDays },
              { id: 'records', label: '정산', icon: ReceiptText },
              { id: 'settings', label: '내 예산', icon: Wallet },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span>
                <item.icon size={22} strokeWidth={page === item.id ? 2.3 : 1.7} />
              </span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
        {modal && (
          <Sheet title={modalTitle(modal)} onClose={() => setModal(null)}>
            {modal.type === 'budget' && <BudgetDetail state={state} today={today} open={open} />}
            {modal.type === 'profile' && (
              <ProfileForm state={state} onSave={(next) => finish(next, '예산 설정을 반영했어요.')} />
            )}
            {modal.type === 'plan' && (
              <PlanForm
                state={state}
                initial={modal.plan}
                onSave={(plan) =>
                  finish(
                    { ...state, plans: [...state.plans.filter((p) => p.id !== plan.id), plan] },
                    plan.confirmed
                      ? '계획 비용을 챙기고 생활비를 다시 계산했어요.'
                      : '미확정 계획으로 저장했어요.',
                  )
                }
              />
            )}
            {modal.type === 'planDetail' && (
              <PlanDetail
                state={state}
                plan={modal.plan}
                open={open}
                onDelete={() => {
                  if (state.transactions.some((t) => t.planId === modal.plan.id)) {
                    notify('연결된 거래가 있어요. 거래를 먼저 수정하거나 삭제해주세요.')
                    return
                  }
                  finish(
                    { ...state, plans: state.plans.filter((p) => p.id !== modal.plan.id) },
                    '계획을 취소하고 확보액을 생활비로 돌렸어요.',
                  )
                }}
              />
            )}
            {modal.type === 'transaction' && (
              <TransactionForm
                state={state}
                planId={modal.planId}
                fixedId={modal.fixedId}
                initial={modal.initial}
                onSave={(next) => finish(next, '거래를 반영했어요.')}
              />
            )}
            {modal.type === 'transactionDetail' && (
              <TransactionDetail
                state={state}
                tx={modal.tx}
                open={open}
                onDelete={() => {
                  try {
                    finish(removeTransaction(state, modal.tx.id), '거래를 삭제하고 잔액을 되돌렸어요.')
                  } catch (e) {
                    notify((e as Error).message)
                  }
                }}
              />
            )}
            {modal.type === 'capture' && (
              <CaptureForm
                state={state}
                onSave={(next) => finish(next, '확인한 거래만 반영했어요. 원본 이미지는 보관하지 않아요.')}
              />
            )}
            {modal.type === 'reconcile' && (
              <Reconcile
                state={state}
                today={today}
                open={open}
                onSave={(next) => finish(next, '정산 완료! 남은 생활비를 다시 확인해보세요.')}
              />
            )}
            {modal.type === 'notifications' && <Notifications state={state} today={today} open={open} />}
            {modal.type === 'calendarImport' && (
              <CalendarImport
                state={state}
                onSave={(next) =>
                  finish(next, '일정을 미확정 계획으로 불러왔어요. 금액을 확인하고 확정해주세요.')
                }
              />
            )}
            {modal.type === 'memory' && (
              <MemoryForm
                initial={modal.memory}
                onSave={(memory) =>
                  finish(
                    { ...state, memories: [...state.memories.filter((m) => m.id !== memory.id), memory] },
                    '기억할 내용을 저장했어요.',
                  )
                }
                onDelete={
                  modal.memory
                    ? () =>
                        finish(
                          { ...state, memories: state.memories.filter((m) => m.id !== modal.memory?.id) },
                          '메모를 삭제했어요.',
                        )
                    : undefined
                }
              />
            )}
            {modal.type === 'help' && <Help />}
            {modal.type === 'demoImport' && (
              <DemoImport
                state={state}
                onSave={(next) => finish(next, '시연 거래를 반영했어요. 실제 금융 데이터가 아니에요.')}
              />
            )}
            {modal.type === 'reset' && (
              <div className="form-stack">
                <span className="intro-icon">
                  <RefreshCw />
                </span>
                <h2>내 예산으로 새로 시작할까요?</h2>
                <p>
                  이 기기에 저장된 예산, 계획, 거래, 메모가 모두 삭제돼요. 보관할 기록은 먼저 백업해주세요.
                </p>
                <Button variant="secondary" onClick={exportData}>
                  <Download size={17} />
                  기존 데이터 백업
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    try {
                      localStorage.removeItem(KEY)
                      setState(null)
                      setModal(null)
                      setPage('home')
                      setStorageError('')
                      window.scrollTo(0, 0)
                    } catch {
                      notify('저장된 데이터를 삭제할 수 없어요.')
                    }
                  }}
                >
                  저장 기록 지우고 시작
                </Button>
              </div>
            )}
            {modal.type === 'restore' && (
              <div className="form-stack">
                <h2>{modal.state.profile.name}님의 백업</h2>
                <p>
                  거래 {modal.state.transactions.length}건, 계획 {modal.state.plans.length}개를 불러와요. 현재
                  기기의 데이터 전체를 교체합니다.
                </p>
                <Button variant="secondary" onClick={exportData}>
                  현재 기록 먼저 백업
                </Button>
                <Button onClick={() => finish(modal.state, '백업 데이터를 복원했어요.')}>
                  이 백업으로 교체
                </Button>
              </div>
            )}
          </Sheet>
        )}
      </>
    )
  return (
    <div className="app-shell">
      {content}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {splash && (
        <div className="splash" role="status" aria-label="flex-able 시작 중">
          <img src="/splash.png" alt="flex-able" />
        </div>
      )}
    </div>
  )
}

function HomePage({
  state,
  today,
  open,
  navigate,
}: {
  state: AppState
  today: string
  open: (m: Modal) => void
  navigate: (p: Page) => void
}) {
  const b = budget(state, today)
  const upcoming = state.plans
    .filter((p) => p.confirmed && !isClosed(state, p.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2)
  const generalToday = state.transactions.filter(
    (t) => t.date === today && t.kind === 'expense' && !t.planId && !t.fixedId,
  )
  return (
    <>
      <div className="greeting">
        <p>{dateLabel(today)}</p>
        <h1>
          {state.profile.name}님,
          <br />
          오늘도 내 페이스대로.
        </h1>
        <span className="greeting-mark" aria-hidden="true">
          ✳
        </span>
      </div>
      <section className="daily-card" aria-label="오늘의 생활비">
        <div className="daily-top">
          <span>오늘 더 쓸 수 있는 돈</span>
          <span className="pill">{b.days > 0 ? `수입일까지 ${b.days}일` : '수입일 확인 필요'}</span>
        </div>
        <div className="hero-amount">
          <Amount value={b.todayRemaining} />
          <ArrowUpRight className="hero-arrow" size={35} />
        </div>
        <p className="daily-message">
          {b.days <= 0
            ? '입금을 기록하고 다음 수입일을 알려주세요.'
            : b.shortage > 0
              ? `확보할 돈이 ${won(b.shortage)}원 부족해요.`
              : b.overToday > 0
                ? `오늘 ${won(b.overToday)}원 초과했어요. 다음 날 나눠 조정해요.`
                : '지킬 돈은 빼뒀으니, 마음 편히 써요.'}
        </p>
        <div className="daily-rule" />
        <div className="daily-stats">
          <div>
            <span>오늘 기준액</span>
            <strong>{won(b.daily)}원</strong>
          </div>
          <div>
            <span>오늘 일반 소비</span>
            <strong>{won(b.generalToday)}원</strong>
          </div>
          <button aria-label="예산 계산 근거 보기" onClick={() => open({ type: 'budget' })}>
            <CircleHelp size={17} />
            계산 보기
          </button>
        </div>
      </section>
      <div className={`reconciled-state ${b.provisional ? '' : 'done'}`}>
        <span>
          {b.provisional ? <span className="status-dot" /> : <Check size={13} />}{' '}
          {b.provisional
            ? `미확인 ${b.pending.length}일, 잠정 금액이에요`
            : '확인한 정산이 반영된 금액이에요'}
        </span>
        <button onClick={() => open({ type: 'reconcile' })}>
          {b.provisional ? '확인하기' : '정산 보기'}
          <ChevronRight size={13} />
        </button>
      </div>
      <p className="reconciled-time">
        마지막 정산:{' '}
        {state.lastReconciled
          ? new Date(state.lastReconciled).toLocaleString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '아직 확인 전'}
      </p>
      {b.todayPlanned > 0 && (
        <button className="today-plan-banner" onClick={() => navigate('plans')}>
          <Heart size={19} />
          <span>
            오늘 약속 예산은 따로 있어요<strong>생활비와 별개로 {won(b.todayPlanned)}원</strong>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <div className="quick-actions">
        <button onClick={() => open({ type: 'transaction' })}>
          <span className="quick-icon mint">
            <Plus size={23} />
          </span>
          <strong>지출 기록</strong>
        </button>
        <button onClick={() => open({ type: 'capture' })}>
          <span className="quick-icon blue">
            <Camera size={23} />
          </span>
          <strong>캡처로 정산</strong>
        </button>
        <button onClick={() => open({ type: 'plan' })}>
          <span className="quick-icon peach">
            <CalendarDays size={23} />
          </span>
          <strong>계획 추가</strong>
        </button>
      </div>
      <section className="home-section">
        <div className="section-heading">
          <h2>
            미리 챙겨둔 즐거움
            <span className="count">
              {state.plans.filter((p) => p.confirmed && !isClosed(state, p.id)).length}
            </span>
          </h2>
          <button className="text-button muted" onClick={() => navigate('plans')}>
            전체 보기
            <ChevronRight size={14} />
          </button>
        </div>
        {upcoming.length ? (
          <div className="upcoming-list">
            {upcoming.map((p) => (
              <button
                className="upcoming-item"
                key={p.id}
                onClick={() => open({ type: 'planDetail', plan: p })}
              >
                <div className={`date-stamp ${p.category === '약속' ? 'peach' : 'lilac'}`}>
                  <span>{asDate(p.date).getMonth() + 1}월</span>
                  <strong>{asDate(p.date).getDate()}</strong>
                </div>
                <span className="row-copy">
                  <strong>{p.title}</strong>
                  <small>
                    {p.date >= state.profile.incomeDate
                      ? '다음 구간에 보관 중'
                      : p.date < today
                        ? '실제 결제내역 확인 필요'
                        : `${p.category} · 예산 확보 완료`}
                  </small>
                </span>
                <span className="row-value">
                  {won(remainingFor(state, p))}
                  <small>원</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="기다리는 즐거움이 있나요?" detail="약속이나 살 물건을 미리 계획해보세요.">
            <button className="text-button" onClick={() => open({ type: 'plan' })}>
              첫 계획 추가하기
              <Plus size={15} />
            </button>
          </Empty>
        )}
      </section>
      <button className="plan-prompt" onClick={() => open({ type: 'plan' })}>
        <span className="prompt-symbol">
          <Sparkles size={23} />
        </span>
        <span>
          <strong>“이번 주말, 약속 잡아도 될까?”</strong>
          <small>계획을 넣고 달라지는 생활비를 확인해요.</small>
        </span>
        <ArrowUpRight size={21} />
      </button>
      <section className="home-section">
        <div className="section-heading">
          <h2>내 생활비 한눈에</h2>
          <button
            className="icon-button small"
            aria-label="예산 상세 보기"
            onClick={() => open({ type: 'budget' })}
          >
            <MoreHorizontal size={21} />
          </button>
        </div>
        <div className="overview">
          <div>
            <span>다음 수입 전 남은 생활비</span>
            <strong>
              <Amount value={Math.max(0, b.rawRemaining)} />
            </strong>
          </div>
          <div className="overview-bar" aria-hidden="true">
            <span
              style={{
                width: `${Math.min(100, (Math.max(0, b.rawRemaining) / Math.max(1, state.profile.balance)) * 100)}%`,
              }}
            />
          </div>
          <div className="overview-legend">
            <span>
              <i />
              일반 생활비
            </span>
            <span>
              <i />
              고정지출 · 보호액 · 계획
            </span>
          </div>
        </div>
      </section>
      <section className="home-section">
        <div className="section-heading">
          <h2>오늘 남긴 기록</h2>
          <button className="text-button muted" onClick={() => navigate('records')}>
            내역 보기
            <ChevronRight size={14} />
          </button>
        </div>
        {generalToday.length ? (
          generalToday
            .slice(0, 3)
            .map((t) => (
              <TransactionRow key={t.id} tx={t} onClick={() => open({ type: 'transactionDetail', tx: t })} />
            ))
        ) : (
          <div className="quiet-empty">
            <ReceiptText size={20} />
            <span>
              아직 등록한 일반 소비가 없어요.
              <br />
              <small>쓴 돈이 있다면 가볍게 남겨주세요.</small>
            </span>
          </div>
        )}
      </section>
      <p className="footer-note">쓸 수 있는 금액이지, 꼭 써야 하는 금액은 아니에요.</p>
    </>
  )
}

function PlansPage({ state, today, open }: { state: AppState; today: string; open: (m: Modal) => void }) {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'draft' | 'closed'>('all')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState('')
  const first = asDate(`${month}-01`)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const shift = (n: number) => {
    const next = new Date(first.getFullYear(), first.getMonth() + n, 1, 12)
    setMonth(localDate(next).slice(0, 7))
    setSelectedDate('')
  }
  const items = state.plans
    .filter(
      (p) =>
        (!selectedDate || p.date === selectedDate) &&
        (filter === 'all' || filter === 'closed'
          ? filter === 'all' || isClosed(state, p.id)
          : !isClosed(state, p.id) && p.confirmed === (filter === 'confirmed')),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">하고 싶은 일도, 예산 안에서</span>
          <h1>소비 계획</h1>
        </div>
        <button
          className="icon-button outline"
          aria-label="캘린더 파일 불러오기"
          onClick={() => open({ type: 'calendarImport' })}
        >
          <Upload size={20} />
        </button>
      </div>
      <div className="plan-summary">
        <span>
          <CalendarDays size={18} />
          이번 구간에 챙겨둔 돈
        </span>
        <strong>
          <Amount value={budget(state, today).plannedReserve} />
        </strong>
      </div>
      <section className="calendar">
        <div className="calendar-header">
          <strong>
            {first.getFullYear()}년 {first.getMonth() + 1}월
          </strong>
          <div>
            <button className="icon-button small" aria-label="이전 달" onClick={() => shift(-1)}>
              <ChevronLeft size={19} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setMonth(today.slice(0, 7))
                setSelectedDate('')
              }}
            >
              오늘
            </button>
            <button className="icon-button small" aria-label="다음 달" onClick={() => shift(1)}>
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
            <span className="weekday" key={d}>
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`
            const hasPlan = state.plans.some((p) => p.date === date)
            return (
              <button
                key={date}
                aria-label={`${date}${hasPlan ? ', 계획 있음' : ''}`}
                aria-pressed={date === selectedDate}
                className={`${date === today ? 'today' : ''} ${date === selectedDate ? 'selected' : ''}`}
                onClick={() => setSelectedDate(date === selectedDate ? '' : date)}
              >
                {i + 1}
                <i className={hasPlan ? 'has-plan' : ''} />
              </button>
            )
          })}
        </div>
      </section>
      <div className="filter-chips">
        {(
          [
            { key: 'all', label: '전체' },
            { key: 'confirmed', label: '확정' },
            { key: 'draft', label: '미확정' },
            { key: 'closed', label: '정산 완료' },
          ] as const
        ).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={filter === f.key ? 'selected' : ''}>
            {f.label}
          </button>
        ))}
      </div>
      {selectedDate && (
        <div className="selected-date">
          <span>{dateLabel(selectedDate)} 계획</span>
          <button className="text-button" onClick={() => setSelectedDate('')}>
            전체 날짜
            <X size={13} />
          </button>
        </div>
      )}
      <div className="plan-list">
        {items.length ? (
          items.map((p) => (
            <button className="plan-card" key={p.id} onClick={() => open({ type: 'planDetail', plan: p })}>
              <div className="plan-card-top">
                <CategoryIcon category={p.category} />
                <span className={`badge ${isClosed(state, p.id) ? 'gray' : p.confirmed ? 'mint' : 'sand'}`}>
                  {isClosed(state, p.id) ? '정산 완료' : p.confirmed ? '확정' : '미확정'}
                </span>
              </div>
              <h3>{p.title}</h3>
              <p>
                {dateLabel(p.date)}
                <span>{p.category}</span>
              </p>
              <div className="plan-card-bottom">
                <strong>
                  <Amount value={isClosed(state, p.id) ? actualFor(state, p.id) : p.amount} />
                </strong>
                <span>
                  {isClosed(state, p.id)
                    ? '실제 사용'
                    : p.date >= state.profile.incomeDate
                      ? '다음 구간'
                      : '내 부담 금액'}
                  <ChevronRight size={15} />
                </span>
              </div>
            </button>
          ))
        ) : (
          <Empty title="아직 계획이 없어요" detail="하고 싶은 일을 적고, 쓸 돈을 미리 챙겨보세요." />
        )}
      </div>
      <Button
        onClick={() =>
          open({
            type: 'plan',
            plan: selectedDate
              ? {
                  id: uid(),
                  title: '',
                  date: selectedDate,
                  amount: 0,
                  category: '기타',
                  confirmed: true,
                  note: '',
                }
              : undefined,
          })
        }
      >
        <Plus size={19} />
        새로운 즐거움 계획하기
      </Button>
      <p className="footer-note">날짜가 지난 계획은 실제 지출을 연결할 때까지 확보해요.</p>
    </>
  )
}

function RecordsPage({ state, today, open }: { state: AppState; today: string; open: (m: Modal) => void }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const spent = (date: string) =>
    state.transactions
      .filter((t) => t.date === date)
      .reduce((n, t) => n + (t.kind === 'expense' ? t.amount : t.kind === 'refund' ? -t.amount : 0), 0)
  const max = Math.max(1, ...weekDates.map(spent))
  const total = weekDates.reduce((n, d) => n + spent(d), 0)
  const items = state.transactions
    .filter(
      (t) =>
        (filter === 'all' || (filter === 'today' ? t.date === today : t.category === filter)) &&
        (!query || t.title.includes(query)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  const dates = [...new Set(items.map((t) => t.date))]
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">기록은 짧게, 마음은 가볍게</span>
          <h1>하루 정산</h1>
        </div>
        <button
          className="icon-button outline"
          aria-label="거래 직접 입력"
          onClick={() => open({ type: 'transaction' })}
        >
          <Plus size={21} />
        </button>
      </div>
      <section className="spending-chart">
        <span>최근 7일 소비</span>
        <strong>
          <Amount value={total} />
        </strong>
        <div
          className="bar-chart"
          role="img"
          aria-label={`최근 7일 소비: ${weekDates.map((d) => `${dateLabel(d)} ${won(spent(d))}원`).join(', ')}`}
        >
          {weekDates.map((d) => (
            <div key={d}>
              <span
                className={`chart-bar ${d === today ? 'current' : ''}`}
                style={{ height: `${Math.max(4, (Math.max(0, spent(d)) / max) * 65)}px` }}
              />
              <small>{d === today ? '오늘' : asDate(d).getDate()}</small>
            </div>
          ))}
        </div>
        <small className="chart-note">일반 소비와 계획 소비 포함 · 환불 차감</small>
      </section>
      <div className="record-actions">
        <button onClick={() => open({ type: 'capture' })}>
          <Camera size={23} />
          <strong>캡처로 가져오기</strong>
          <small>내역을 읽고 확인해요</small>
        </button>
        <button onClick={() => open({ type: 'transaction' })}>
          <Pencil size={22} />
          <strong>직접 기록하기</strong>
          <small>한 건씩 간단하게</small>
        </button>
      </div>
      <button className="reconcile-callout" onClick={() => open({ type: 'reconcile' })}>
        <span className="item-icon mint">
          <CheckCheck size={21} />
        </span>
        <span>
          <strong>빠진 내역, 확인했나요?</strong>
          <small>확인을 마치면 하루 정산 완료</small>
        </span>
        <ChevronRight size={19} />
      </button>
      <div className="section-heading">
        <h2>
          내 거래내역 <span className="count">{state.transactions.length}</span>
        </h2>
        <ListFilter size={17} />
      </div>
      <input
        className="search-input"
        aria-label="거래 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="어디에 썼는지 찾아보기"
      />
      <div className="filter-chips scroll-chips">
        {[
          { key: 'all', label: '전체' },
          { key: 'today', label: '오늘' },
          ...categories.map((c) => ({ key: c, label: c })),
        ].map((f) => (
          <button key={f.key} className={filter === f.key ? 'selected' : ''} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {dates.length ? (
        dates.map((d) => (
          <section className="transaction-group" key={d}>
            <div className="group-heading">
              <span>{d === today ? '오늘' : dateLabel(d)}</span>
              <span>{state.reconciledDates.includes(d) ? '정산 완료' : '확인 전'}</span>
            </div>
            {items
              .filter((t) => t.date === d)
              .map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  onClick={() => open({ type: 'transactionDetail', tx: t })}
                />
              ))}
          </section>
        ))
      ) : (
        <Empty title="표시할 거래가 없어요" detail="캡처를 올리거나 직접 내역을 기록해주세요." />
      )}
      <button className="demo-link" onClick={() => open({ type: 'demoImport' })}>
        금융 연동 대신 예시 내역으로 시연하기
      </button>
      <p className="footer-note">토스·카카오페이 자동 연동은 연결되어 있지 않아요.</p>
    </>
  )
}

function SettingsPage({
  state,
  open,
  onExport,
  onRestore,
  save,
  notify,
}: {
  state: AppState
  open: (m: Modal) => void
  onExport: () => void
  onRestore: (f: File) => void
  save: (s: AppState, m?: string) => boolean
  notify: (s: string) => void
}) {
  const b = budget(state)
  const requestNotifications = async () => {
    if (state.notifications) {
      save({ ...state, notifications: false }, '정산 알림을 껐어요.')
      return
    }
    if (!('Notification' in window)) {
      save(
        { ...state, notifications: true },
        '앱 안에서 정산 시간을 알려드릴게요. 이 브라우저는 시스템 알림을 지원하지 않아요.',
      )
      return
    }
    try {
      const permission = await Notification.requestPermission()
      save(
        { ...state, notifications: true },
        permission === 'granted'
          ? '앱이 열려 있을 때 정산 알림을 드려요.'
          : '앱 안의 알림만 켰어요. 브라우저 알림은 허용되지 않았어요.',
      )
    } catch {
      notify('알림 권한을 요청할 수 없어요. 브라우저 설정을 확인해주세요.')
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">내 돈에 나만의 기준을</span>
          <h1>내 예산</h1>
        </div>
        <span className="profile-avatar">{state.profile.name.slice(0, 1)}</span>
      </div>
      <button className="account-card" onClick={() => open({ type: 'profile' })}>
        <span className="item-icon mint">
          <Wallet size={22} />
        </span>
        <span>
          <small>현재 사용 가능 잔액</small>
          <strong>
            <Amount value={state.profile.balance} />
          </strong>
        </span>
        <Pencil size={18} />
      </button>
      <section className="settings-section">
        <div className="section-heading">
          <h2>내 예산 설정</h2>
          <button className="text-button" onClick={() => open({ type: 'profile' })}>
            수정
            <Pencil size={13} />
          </button>
        </div>
        <Row
          icon={Landmark}
          title="다음 수입"
          subtitle={`${dateLabel(state.profile.incomeDate)} · 입금 전에는 예산에서 제외`}
          value={`${won(state.profile.incomeAmount)}원`}
        />
        <Row
          icon={ReceiptText}
          color="peach"
          title="미납 고정지출"
          subtitle={`${state.fixed.length}개 항목 등록`}
          value={`${won(b.fixedReserve)}원`}
          onClick={() => open({ type: 'budget' })}
        />
        <Row
          icon={ShieldCheck}
          color="lilac"
          title="보호할 돈"
          subtitle={`${state.profile.protectionCycle} 검토 · 현재 구간 총액`}
          value={`${won(state.profile.protectedAmount)}원`}
        />
        <Row
          icon={Wallet}
          color="sand"
          title="미결제 카드액"
          value={`${won(state.profile.cardOutstanding)}원`}
        />
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>기억해둘 소비 기준</h2>
          <button className="text-button" onClick={() => open({ type: 'memory' })}>
            추가
            <Plus size={15} />
          </button>
        </div>
        <p className="section-description">
          계획할 때 참고할 나만의 메모예요. AI에 전송하거나 예산을 자동 변경하지 않아요.
        </p>
        {state.memories.length ? (
          state.memories.map((m) => (
            <button key={m.id} className="memory-card" onClick={() => open({ type: 'memory', memory: m })}>
              <span>
                <strong>{m.title}</strong>
                <small>{m.text}</small>
              </span>
              <Pencil size={16} />
            </button>
          ))
        ) : (
          <button className="memory-card" onClick={() => open({ type: 'memory' })}>
            <span>
              <strong>내 소비 기준 남기기</strong>
              <small>예: 데이트 비용은 내 몫만 계산하기</small>
            </span>
            <Plus size={18} />
          </button>
        )}
      </section>
      <section className="settings-section">
        <h2>정산 알림</h2>
        <div className="list-row">
          <span className="item-icon blue">
            <Bell size={20} />
          </span>
          <span className="row-copy">
            <strong>하루 정산 알려주기</strong>
            <small>앱이 열려 있을 때만 동작</small>
          </span>
          <button
            className={`switch ${state.notifications ? 'on' : ''}`}
            aria-label="정산 알림"
            role="switch"
            aria-checked={state.notifications}
            onClick={() => void requestNotifications()}
          >
            <span />
          </button>
        </div>
        <Field label="알림 받을 시간">
          <input
            type="time"
            value={state.notificationTime}
            onChange={(e) => {
              if (e.target.value) save({ ...state, notificationTime: e.target.value })
            }}
          />
        </Field>
        <p className="field-hint">
          앱을 닫은 상태의 푸시에는 서버 연결이 필요해요. iPhone 시스템 알림은 홈 화면 설치와 브라우저 지원이
          필요할 수 있어요.
        </p>
        {state.notifications && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                await sendNotification(
                  '오늘의 생활비',
                  `일반 생활비 ${won(b.todayRemaining)}원 · 예정 소비 ${won(b.todayPlanned)}원${b.provisional ? ' · 잠정 금액' : ''}`,
                )
                notify('테스트 알림을 보냈어요.')
              } catch {
                notify('시스템 알림을 사용할 수 없어요. 브라우저 알림 권한을 확인해주세요.')
              }
            }}
          >
            테스트 알림 보내기
          </button>
        )}
      </section>
      <section className="settings-section">
        <h2>내 데이터</h2>
        <Row
          icon={Download}
          title="백업 파일 저장"
          subtitle="예산과 모든 기록을 JSON으로 보관"
          value={<ChevronRight size={18} />}
          onClick={onExport}
        />
        <label className="file-row">
          <span className="item-icon blue">
            <Upload size={20} />
          </span>
          <span className="row-copy">
            <strong>백업 불러오기</strong>
            <small>현재 기록을 백업 파일로 교체</small>
          </span>
          <ChevronRight size={18} />
          <input
            aria-label="백업 파일 선택"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              if (e.target.files?.[0]) onRestore(e.target.files[0])
              e.target.value = ''
            }}
          />
        </label>
        <Row
          icon={CircleHelp}
          color="sand"
          title="계산 원칙과 이용 안내"
          value={<ChevronRight size={18} />}
          onClick={() => open({ type: 'help' })}
        />
        <Row
          icon={Trash2}
          color="pink"
          title="모든 기록 초기화"
          value={<ChevronRight size={18} />}
          onClick={() => open({ type: 'reset' })}
        />
      </section>
      <div className="privacy-card">
        <LockKeyhole size={18} />
        <p>
          데이터는 이 브라우저에만 저장돼요.
          <br />
          브라우저 데이터를 지우면 사라지니 백업해주세요.
        </p>
      </div>
      <div className="settings-footer">
        <Brand />
        <span>나답게 쓰는 매일 · v1.0</span>
      </div>
    </>
  )
}

function TransactionRow({ tx, onClick }: { tx: Transaction; onClick: () => void }) {
  return (
    <button className="transaction-row" onClick={onClick}>
      <CategoryIcon category={tx.category} />
      <span className="row-copy">
        <strong>{tx.title}</strong>
        <small>
          {tx.kind === 'expense'
            ? `${tx.category} · ${tx.method === 'card' ? '신용카드' : '계좌·현금'}${tx.planId ? ' · 계획 소비' : tx.fixedId ? ' · 고정지출' : ''}`
            : { income: '수입', refund: '환불', transfer: '내 계좌 이체', card_payment: '카드대금 납부' }[
                tx.kind
              ]}
        </small>
      </span>
      <strong className={`row-value ${['income', 'refund'].includes(tx.kind) ? 'green' : ''}`}>
        {['income', 'refund'].includes(tx.kind) ? '+' : tx.kind === 'transfer' ? '' : '−'}
        {won(tx.amount)}
        <small>원</small>
      </strong>
    </button>
  )
}
function BudgetDetail({ state, today, open }: { state: AppState; today: string; open: (m: Modal) => void }) {
  const b = budget(state, today)
  return (
    <div className="form-stack">
      <div className="detail-hero">
        <span>오늘부터 {dateLabel(addDays(state.profile.incomeDate, -1))}까지</span>
        <h2>
          하루 <Amount value={b.daily} />
        </h2>
        <p>남은 생활비를 오늘 포함 {Math.max(0, b.days)}일로 나눠요.</p>
      </div>
      <div className="calculation">
        <div>
          <span>현재 사용 가능 잔액</span>
          <strong>{won(state.profile.balance)}원</strong>
        </div>
        {[
          { title: '미납 고정지출', amount: b.fixedReserve },
          { title: '미결제 카드 이용액', amount: Math.max(0, state.profile.cardOutstanding) },
          { title: '보호할 저축 · 비상금', amount: state.profile.protectedAmount },
          { title: '확정한 예정 지출', amount: b.plannedReserve },
        ].map((r) => (
          <div key={r.title}>
            <span>{r.title}</span>
            <strong>− {won(r.amount)}원</strong>
          </div>
        ))}
        <div className="calculation-result">
          <span>현재 남은 일반 생활비</span>
          <strong className={b.shortage ? 'danger-text' : 'green'}>{won(b.rawRemaining)}원</strong>
        </div>
        <div>
          <span>오늘 일반 소비 되돌려 계산</span>
          <strong>+ {won(b.generalToday)}원</strong>
        </div>
        <div>
          <span>오늘 시작 기준액</span>
          <strong>{won(b.daily)}원 / 일</strong>
        </div>
        <div>
          <span>오늘 일반 소비 차감 후</span>
          <strong>{won(b.todayRemaining)}원</strong>
        </div>
      </div>
      <p className="info-box">
        현재 잔액에는 오늘 소비가 이미 빠져 있어요. 오늘 시작 기준을 구할 때만 되돌린 뒤, 오늘 쓴 돈을 한 번
        차감해요. 매일 날짜가 바뀌면 남은 기간으로 재분배해요.
      </p>
      {b.shortage > 0 && (
        <p className="warning-box">
          {won(b.shortage)}원이 부족해요. 계획을 미루거나 금액을 조정해주세요. 사용 가능액은 0원으로 표시해요.
        </p>
      )}
      <h3>고정지출별 확인</h3>
      {state.fixed.length ? (
        state.fixed.map((f) => (
          <Row
            key={f.id}
            title={f.title}
            subtitle={`${dateLabel(f.date)} · ${isClosed(state, f.id) ? '납부 완료' : f.date >= state.profile.incomeDate ? '다음 구간' : '미납'}`}
            value={`${won(remainingFor(state, f))}원`}
            onClick={() => open({ type: 'transaction', fixedId: f.id })}
          />
        ))
      ) : (
        <p className="muted">등록된 고정지출이 없어요.</p>
      )}
      <Button variant="secondary" onClick={() => open({ type: 'profile' })}>
        <Settings2 size={17} />
        계산에 쓰인 항목 수정
      </Button>
    </div>
  )
}
function PlanDetail({
  state,
  plan,
  open,
  onDelete,
}: {
  state: AppState
  plan: Plan
  open: (m: Modal) => void
  onDelete: () => void
}) {
  const [cancel, setCancel] = useState(false)
  const closed = isClosed(state, plan.id)
  const actual = actualFor(state, plan.id)
  return (
    <div className="form-stack">
      <div className="detail-hero">
        <CategoryIcon category={plan.category} />
        <h2>{plan.title}</h2>
        <p>
          {dateLabel(plan.date)} · {plan.category}
        </p>
        <strong className="detail-amount">
          <Amount value={plan.amount} />
        </strong>
        <span>내 부담 예상액</span>
      </div>
      {plan.note && <p className="info-box">{plan.note}</p>}
      <div className="calculation">
        <div>
          <span>실제 소비</span>
          <strong>{won(actual)}원</strong>
        </div>
        <div>
          <span>{closed ? '생활비로 돌려준 차액' : '남은 확보액'}</span>
          <strong className="green">
            {won(closed ? plan.amount - actual : remainingFor(state, plan))}원
          </strong>
        </div>
      </div>
      {closed ? (
        <p className="info-box">
          <CheckCheck size={18} />
          정산 완료.{' '}
          {plan.amount >= actual
            ? '덜 쓴 돈은 일반 생활비에 반영됐어요.'
            : '초과분은 남은 생활비에 반영됐어요.'}{' '}
          이 기록은 같은 카테고리의 다음 계획 금액을 제안할 때 참고해요.
        </p>
      ) : (
        <>
          <Button disabled={!plan.confirmed} onClick={() => open({ type: 'transaction', planId: plan.id })}>
            실제 쓴 돈 연결하기
            <ArrowRight size={17} />
          </Button>
          <Button variant="secondary" onClick={() => open({ type: 'plan', plan })}>
            <Pencil size={17} />
            {plan.confirmed ? '계획 수정' : '금액 확인하고 확정'}
          </Button>
        </>
      )}
      {state.transactions
        .filter((t) => t.planId === plan.id)
        .map((t) => (
          <TransactionRow key={t.id} tx={t} onClick={() => open({ type: 'transactionDetail', tx: t })} />
        ))}
      {!state.transactions.some((t) => t.planId === plan.id) &&
        (cancel ? (
          <div className="warning-box">
            <p>계획을 삭제하고 확보한 돈을 생활비로 돌릴까요?</p>
            <Button variant="danger" onClick={onDelete}>
              계획 취소 확정
            </Button>
          </div>
        ) : (
          <Button variant="quiet" onClick={() => setCancel(true)}>
            이 계획 취소하기
          </Button>
        ))}
    </div>
  )
}
function TransactionDetail({
  state,
  tx,
  open,
  onDelete,
}: {
  state: AppState
  tx: Transaction
  open: (m: Modal) => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const link =
    state.plans.find((p) => p.id === tx.planId)?.title || state.fixed.find((f) => f.id === tx.fixedId)?.title
  return (
    <div className="form-stack">
      <div className="detail-hero">
        <CategoryIcon category={tx.category} />
        <h2>{tx.title}</h2>
        <strong className="detail-amount">
          <Amount value={tx.amount} />
        </strong>
        <p>{dateLabel(tx.date)}</p>
      </div>
      <Row
        title="거래 구분"
        value={
          {
            expense: '지출',
            refund: '환불',
            income: '수입',
            transfer: '내 계좌 이체',
            card_payment: '카드대금 납부',
          }[tx.kind]
        }
      />
      <Row
        title="입력 방식"
        value={{ manual: '직접 입력', capture: '캡처 확인', demo: '시연 데이터' }[tx.source]}
      />
      {link && <Row title="연결한 예산" value={link} />}
      <Button variant="secondary" onClick={() => open({ type: 'transaction', initial: tx })}>
        <Pencil size={17} />
        거래 수정
      </Button>
      {confirming ? (
        <div className="warning-box">
          <p>이 거래를 삭제하고 잔액을 되돌릴까요? 연결된 계획의 정산 상태도 다시 계산해요.</p>
          <Button variant="danger" onClick={onDelete}>
            거래 삭제 확정
          </Button>
        </div>
      ) : (
        <Button variant="quiet" onClick={() => setConfirming(true)}>
          <Trash2 size={16} />
          거래 삭제
        </Button>
      )}
    </div>
  )
}
function Reconcile({
  state,
  today,
  open,
  onSave,
}: {
  state: AppState
  today: string
  open: (m: Modal) => void
  onSave: (s: AppState) => void
}) {
  const pending = budget(state, today).pending
  const [date, setDate] = useState(pending[0] || addDays(today, -1))
  const [checked, setChecked] = useState(false)
  const transactions = state.transactions.filter((t) => t.date === date)
  return (
    <div className="form-stack">
      <div className="form-intro compact">
        <span className="intro-icon">
          <CheckCheck />
        </span>
        <h2>
          하루를 가볍게
          <br />
          마무리해요.
        </h2>
        <p>빠진 결제가 없는지 확인하고 정산해주세요.</p>
      </div>
      <Field label="정산할 날짜">
        <input
          required
          type="date"
          max={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setChecked(false)
          }}
        />
      </Field>
      {pending.length > 0 && (
        <div className="pending-dates">
          <span>아직 확인하지 않은 날 {pending.length}일</span>
          <div>
            {pending.slice(0, 7).map((d) => (
              <button
                type="button"
                key={d}
                className={d === date ? 'selected' : ''}
                onClick={() => {
                  setDate(d)
                  setChecked(false)
                }}
              >
                {asDate(d).getMonth() + 1}/{asDate(d).getDate()}
              </button>
            ))}
          </div>
        </div>
      )}
      {transactions.length ? (
        transactions.map((t) => (
          <TransactionRow key={t.id} tx={t} onClick={() => open({ type: 'transactionDetail', tx: t })} />
        ))
      ) : (
        <p className="info-box">등록된 거래가 없어요. 내역이 없다고 무지출로 자동 확정하지 않아요.</p>
      )}
      <div className="form-columns">
        <Button variant="secondary" onClick={() => open({ type: 'capture' })}>
          <Camera size={17} />
          캡처 추가
        </Button>
        <Button variant="secondary" onClick={() => open({ type: 'transaction' })}>
          <Plus size={17} />
          직접 추가
        </Button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>
          {transactions.length ? '빠진 거래 없이 모두 확인했어요' : '이날 소비가 없었던 것이 맞아요'}
          <small>확인 전 날짜는 잠정 상태로 유지해요.</small>
        </span>
      </label>
      <Button
        disabled={!checked || !date || date > today}
        onClick={() =>
          onSave({
            ...state,
            reconciledDates: [...new Set([...state.reconciledDates, date])],
            lastReconciled: new Date().toISOString(),
          })
        }
      >
        {state.reconciledDates.includes(date) ? '다시 확인 완료' : '하루 정산 완료'}
        <Check size={17} />
      </Button>
      {state.lastReconciled && (
        <p className="field-hint">마지막 확인: {new Date(state.lastReconciled).toLocaleString('ko-KR')}</p>
      )}
    </div>
  )
}
function Notifications({ state, today, open }: { state: AppState; today: string; open: (m: Modal) => void }) {
  const b = budget(state, today)
  return (
    <div className="form-stack">
      <p className="section-description">지금 확인하면 좋은 내용이에요.</p>
      {b.provisional && (
        <Row
          icon={ReceiptText}
          title={`${b.pending.length}일의 정산이 남아 있어요`}
          subtitle="확인 전 생활비는 잠정 금액이에요."
          value={<ChevronRight size={17} />}
          onClick={() => open({ type: 'reconcile' })}
        />
      )}
      <Row
        icon={Wallet}
        title={`오늘 일반 생활비 ${won(b.todayRemaining)}원`}
        subtitle={`오늘 예정 소비 ${won(b.todayPlanned)}원은 별도예요.`}
        onClick={() => open({ type: 'budget' })}
      />
      {b.shortage > 0 && (
        <Row
          icon={ShieldCheck}
          color="pink"
          title={`${won(b.shortage)}원 부족해요`}
          subtitle="확보액 또는 소비 계획을 조정해주세요."
          onClick={() => open({ type: 'profile' })}
        />
      )}{' '}
      {b.days <= 0 && (
        <Row
          icon={Landmark}
          title="새 수입 구간을 설정해주세요"
          subtitle="실제 입금 기록 후 다음 수입일을 수정해주세요."
          onClick={() => open({ type: 'profile' })}
        />
      )}{' '}
      {state.plans
        .filter((p) => p.confirmed && p.date < today && !isClosed(state, p.id))
        .map((p) => (
          <Row
            key={p.id}
            icon={CalendarDays}
            color="peach"
            title={`${p.title}, 얼마 쓰셨나요?`}
            subtitle="계획을 실제 내역과 연결하면 차액을 조정해요."
            onClick={() => open({ type: 'transaction', planId: p.id })}
          />
        ))}
      <p className="field-hint">
        정산은 사용자의 확인 후 완료돼요. 앱이 닫혀 있을 때 자동으로 내역을 수집하지 않아요.
      </p>
    </div>
  )
}
function MemoryForm({
  initial,
  onSave,
  onDelete,
}: {
  initial?: Memory
  onSave: (m: Memory) => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [text, setText] = useState(initial?.text || '')
  const [deleting, setDeleting] = useState(false)
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() && text.trim())
          onSave({ id: initial?.id || uid(), title: title.trim(), text: text.trim() })
      }}
    >
      <p className="intro-copy">
        계획을 만들 때 다시 볼 수 있는 나만의 기준이에요. 메모만 바꿔서는 예산 금액이 바뀌지 않아요.
      </p>
      <Field label="제목">
        <input
          required
          maxLength={40}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 친구들과 약속"
        />
      </Field>
      <Field label="기억할 내용">
        <textarea
          required
          maxLength={500}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 회식 다음 날에는 식비를 여유 있게 잡기"
        />
      </Field>
      <Button type="submit">
        기억해두기
        <Check size={17} />
      </Button>
      {onDelete && (
        <Button
          variant={deleting ? 'danger' : 'quiet'}
          onClick={() => (deleting ? onDelete() : setDeleting(true))}
        >
          {deleting ? '메모 삭제 확정' : '메모 삭제'}
        </Button>
      )}
    </form>
  )
}
function CalendarImport({ state, onSave }: { state: AppState; onSave: (s: AppState) => void }) {
  const [items, setItems] = useState<Array<{ title: string; date: string; selected: boolean }>>([])
  const [error, setError] = useState('')
  return (
    <div className="form-stack">
      <p>캘린더에서 내보낸 .ics 파일을 불러올 수 있어요. 금액이 없는 일정은 미확정 상태로 저장해요.</p>
      <label className="upload-zone">
        <Upload size={28} />
        <strong>캘린더 파일 선택</strong>
        <span>.ics · 1MB 이하</span>
        <input
          aria-label="캘린더 파일 선택"
          type="file"
          accept=".ics,text/calendar"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              if (file.size > 1e6) throw new Error('1MB 이하 파일을 선택해주세요.')
              const events = parseCalendar(await file.text()).filter((p) => p.date >= localDate())
              const unique = events.filter(
                (p, i) => events.findIndex((x) => x.title === p.title && x.date === p.date) === i,
              )
              if (!unique.length) throw new Error('오늘 이후의 일정을 찾지 못했어요.')
              setItems(
                unique.map((p) => ({
                  ...p,
                  selected: !state.plans.some((plan) => plan.title === p.title && plan.date === p.date),
                })),
              )
              setError('')
            } catch (err) {
              setError((err as Error).message)
            }
          }}
        />
      </label>
      {items.map((item, i) => (
        <label className="check-row" key={i}>
          <input
            type="checkbox"
            checked={item.selected}
            onChange={(e) =>
              setItems((rows) =>
                rows.map((r, index) => (index === i ? { ...r, selected: e.target.checked } : r)),
              )
            }
          />
          <span>
            {item.title}
            <small>
              {dateLabel(item.date)}
              {state.plans.some((p) => p.title === item.title && p.date === item.date)
                ? ' · 이미 등록된 일정'
                : ''}
            </small>
          </span>
        </label>
      ))}
      <p className="field-hint">
        자동 동기화는 제공하지 않아요. 반복 일정은 파일에 명시된 시작일만 불러오며, 반복 규칙은 펼치지 않아요.
        시간대가 있는 일정은 날짜를 한 번 더 확인해주세요.
      </p>
      <ErrorText message={error} />
      <Button
        disabled={!items.some((i) => i.selected)}
        onClick={() =>
          onSave({
            ...state,
            plans: [
              ...state.plans,
              ...items
                .filter((i) => i.selected)
                .map((i) => ({
                  id: uid(),
                  title: i.title,
                  date: i.date,
                  amount: 0,
                  confirmed: false,
                  category: '약속' as const,
                  note: '캘린더에서 가져온 일정 · 내 부담 금액 확인 필요',
                })),
            ],
          })
        }
      >
        선택 일정 불러오기
      </Button>
    </div>
  )
}
function DemoImport({ state, onSave }: { state: AppState; onSave: (s: AppState) => void }) {
  const date = addDays(localDate(), -1)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)
  const examples = [
    { title: '샘플 분식', amount: 8000, category: '식비' as const },
    { title: '샘플 커피', amount: 4000, category: '카페' as const },
  ]
  return (
    <div className="form-stack">
      <p className="warning-box">
        실제 금융 서비스와 연결된 내역이 아니에요. 입력·정산 흐름을 확인하는 예시이며, 반영하면 현재 잔액에서
        차감돼요.
      </p>
      {examples.map((t) => (
        <Row key={t.title} title={t.title} subtitle={dateLabel(date)} value={`${won(t.amount)}원`} />
      ))}
      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>예시 거래를 현재 예산에 반영할게요</span>
      </label>
      <ErrorText message={error} />
      <Button
        disabled={!checked}
        onClick={() => {
          try {
            let next = state
            for (const t of examples) {
              if (isDuplicate(next, { ...t, date }))
                throw new Error('이미 같은 예시 거래가 있어요. 중복 반영하지 않았어요.')
              next = addTransaction(next, {
                ...t,
                id: uid(),
                date,
                kind: 'expense',
                method: 'cash',
                source: 'demo',
              })
            }
            onSave(next)
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      >
        예시 거래 2건 반영
      </Button>
    </div>
  )
}
function Help() {
  return (
    <div className="help-content">
      <h3>오늘 얼마 더 쓸 수 있나요?</h3>
      <p>
        현재 잔액에서 미납 고정지출, 미결제 카드액, 보호할 돈, 확정된 계획을 제외해요. 오늘 포함 다음 수입일
        전날까지 나눠 하루 기준을 만들고 오늘 일반 소비를 빼요.
      </p>
      <h3>계획에 쓴 돈은 따로 계산해요</h3>
      <p>
        거래를 계획과 연결하면 이미 확보한 금액을 사용해요. 마지막 거래에서 정산 완료를 선택하면 남은 돈이
        생활비로 돌아가요. 초과분도 남은 예산에 그대로 반영돼요.
      </p>
      <h3>카드값을 두 번 빼지 않아요</h3>
      <p>
        신용카드 소비는 미결제액으로 확보하고, 카드대금 납부는 잔액과 미결제액을 같이 줄여요. 환불은 원래
        결제에 연결하며, 내 계좌 사이 이체는 소비로 보지 않아요.
      </p>
      <h3>다음 수입일이 되면</h3>
      <p>
        실제 입금을 ‘수입’ 거래로 기록한 뒤 다음 수입일과 고정지출을 다시 설정해주세요. 현재 버전은 수입
        구간과 고정지출을 자동 반복하지 않아요. 입금 예정액을 미리 쓸 수 있는 돈으로 취급하지 않아요.
      </p>
      <h3>캡처와 계획 도우미</h3>
      <p>
        캡처는 기기에서 문자를 읽고 사용자 확인 후 반영해요. 첫 인식에는 언어 자료 다운로드가 필요해요. 자연어
        계획은 날짜·금액·카테고리를 규칙으로 추출하며, 서버 AI는 연결되지 않았어요. 금액 제안은 실제로 정산한
        같은 카테고리 계획을 근거로 해요.
      </p>
      <h3>데이터 보관과 알림</h3>
      <p>
        계정·서버·금융 연동이 없는 로컬 버전이에요. 기록은 현재 브라우저에 저장되고 다른 기기와 동기화되지
        않아요. 캡처 원본은 저장하지 않아요. 브라우저 데이터 삭제 전 백업해주세요. 앱을 닫은 상태의 푸시는
        지원하지 않아요.
      </p>
    </div>
  )
}
function modalTitle(modal: Modal) {
  if (modal.type === 'plan') return modal.plan ? '소비 계획 수정' : '새 소비 계획'
  if (modal.type === 'transaction') return modal.initial ? '거래 수정' : '거래 기록'
  return {
    budget: '생활비 계산 근거',
    profile: '내 예산 설정',
    capture: '캡처로 거래 가져오기',
    reconcile: '하루 정산',
    notifications: '내 알림',
    calendarImport: '캘린더 가져오기',
    help: 'flex-able 이용 안내',
    reset: '새로 시작하기',
    demoImport: '예시 내역 시연',
    planDetail: '소비 계획',
    transactionDetail: '거래 상세',
    memory: '기억해둘 소비 기준',
    restore: '백업 복원',
  }[modal.type]
}
function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function sendNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') throw new Error('알림 권한 없음')
  const registration =
    'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  if (registration) await registration.showNotification(title, { body, icon: '/icon-192.png' })
  else new Notification(title, { body, icon: '/icon.svg' })
}
