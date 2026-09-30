import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
  CloudOff,
  Download,
  FileSpreadsheet,
  Heart,
  Home,
  Landmark,
  ListFilter,
  LockKeyhole,
  LogOut,
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
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import {
  addDays,
  asDate,
  categories,
  dateLabel,
  localDate,
  parseCalendar,
  sourceLabels,
  uid,
  won,
  type Ledger,
  type Memory,
  type Plan,
  type PlanView,
  type Transaction,
} from './domain'
import {
  connectionStatus,
  errorMessage,
  loadConfig,
  onConnectionChange,
  onSignedOut,
  refreshAccessToken,
  type ConnectionStatus,
} from './api/client'
import { auth, ledgerApi, loadLedger, type Me } from './api/ledger'
import { Amount, Brand, Button, CategoryIcon, Empty, ErrorText, Field, Row, Sheet } from './ui'
import { AuthForm, CaptureForm, PlanForm, ProfileForm, TransactionForm, Welcome } from './forms'
import { BankSyncInfo, CsvForm } from './importUI'
import {
  addPlanToCalendar,
  deviceCalendarAvailable,
  deviceEvents,
  googleCalendarAvailable,
  googleEvents,
} from './calendar'
import { isNative } from './native'

type Page = 'home' | 'plans' | 'records' | 'settings'
type Phase = 'booting' | 'offline' | 'welcome' | 'auth' | 'setup' | 'ready'
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
        | 'csv'
        | 'bankSync'
    }
  | { type: 'plan'; plan?: Plan }
  | { type: 'planDetail'; plan: PlanView }
  | { type: 'transaction'; planId?: string; fixedId?: string; initial?: Transaction }
  | { type: 'transactionDetail'; tx: Transaction }
  | { type: 'memory'; memory?: Memory }
type Act = (task: () => Promise<unknown>, message: string) => Promise<void>

export default function App() {
  const [phase, setPhase] = useState<Phase>('booting')
  const [bootError, setBootError] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [splash, setSplash] = useState(true)
  const [page, setPage] = useState<Page>('home')
  const [modal, setModal] = useState<Modal | null>(null)
  const [toast, setToast] = useState('')
  const [guestBusy, setGuestBusy] = useState(false)
  const [connection, setConnection] = useState<ConnectionStatus>(connectionStatus())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useCallback((message: string) => {
    setToast(message)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 4500)
  }, [])

  /** 로그인한 사용자와 데이터를 서버에서 불러온다. 예산 설정 전이면 설정 화면으로 간다. */
  const loadUser = useCallback(async () => {
    const who = await auth.me()
    const data = await loadLedger(who)
    setMe(who)
    setLedger(data)
    setPhase(data ? 'ready' : 'setup')
  }, [])
  const boot = useCallback(async () => {
    setPhase('booting')
    setBootError('')
    try {
      await loadConfig()
      if (await refreshAccessToken()) await loadUser()
      else setPhase('welcome')
    } catch (e) {
      setBootError(errorMessage(e))
      setPhase('offline')
    }
  }, [loadUser])
  const reload = useCallback(async () => {
    if (!me) return
    const data = await loadLedger(me)
    setLedger(data)
    if (!data) setPhase('setup')
  }, [me])
  /** 서버에 변경을 요청하고, 성공하면 다시 불러와 화면을 서버 상태와 맞춘다. 실패는 호출한 폼이 보여준다. */
  const act: Act = useCallback(
    async (task, message) => {
      await task()
      await reload()
      if (message) notify(message)
      setModal(null)
    },
    [reload, notify],
  )
  const run = (task: () => Promise<unknown>, message: string) =>
    act(task, message).catch((e) => notify(errorMessage(e)))

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1500)
    void boot()
    return () => clearTimeout(t)
  }, [boot])
  useEffect(() => onConnectionChange(setConnection), [])
  useEffect(
    () =>
      onSignedOut(() => {
        setLedger(null)
        setMe(null)
        setModal(null)
        setPhase('welcome')
        notify('로그인이 만료됐어요. 다시 로그인해주세요.')
      }),
    [notify],
  )
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [page])
  // 날짜가 바뀌면 서버 기준으로 다시 계산한 오늘 예산을 받는다.
  useEffect(() => {
    if (!ledger) return
    const t = setInterval(() => {
      if (localDate() !== ledger.budget.today) void reload().catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [ledger, reload])
  useEffect(() => {
    if (!ledger?.notifications) return
    const check = () => {
      const now = new Date()
      const date = localDate(now)
      const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      if (current < ledger.notificationTime || ledger.reconciledDates.includes(date)) return
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
  }, [ledger, notify])

  const startGuest = async () => {
    setGuestBusy(true)
    try {
      await auth.guest(true)
      await loadUser()
      setPage('home')
      notify('예시 데이터로 둘러보고 있어요.')
    } catch (e) {
      notify(errorMessage(e))
    } finally {
      setGuestBusy(false)
    }
  }
  const logout = async () => {
    try {
      await auth.logout()
    } catch {
      // 서버에 닿지 않아도 이 기기에서는 로그아웃한다.
    }
    setLedger(null)
    setMe(null)
    setModal(null)
    setPage('home')
    setPhase('welcome')
  }
  const exportData = () => {
    if (!ledger) return
    downloadFile(`flex-able-${ledger.budget.today}.json`, JSON.stringify(ledger, null, 2), 'application/json')
    notify('내 데이터를 파일로 저장했어요.')
  }
  const open = (next: Modal) => setModal(next)

  let content: ReactNode
  if (phase === 'booting') content = <div className="onboarding" aria-busy="true" />
  else if (phase === 'offline')
    content = (
      <div className="onboarding">
        <div className="recovery">
          <Brand />
          <span className="intro-icon">
            <CloudOff />
          </span>
          <h1>
            서버에 연결할 수
            <br />
            없어요.
          </h1>
          <p>{bootError || '네트워크를 확인하고 다시 시도해주세요.'}</p>
          <Button onClick={() => void boot()}>
            <RefreshCw size={17} />
            다시 연결하기
          </Button>
        </div>
      </div>
    )
  else if (phase === 'welcome')
    content = (
      <div className="onboarding">
        <Welcome onStart={() => setPhase('auth')} onDemo={() => void startGuest()} busy={guestBusy} />
      </div>
    )
  else if (phase === 'auth')
    content = (
      <div className="onboarding">
        <AuthForm onDone={loadUser} onBack={() => setPhase('welcome')} />
      </div>
    )
  else if (phase === 'setup' || !ledger)
    content = (
      <div className="onboarding">
        <ProfileForm
          onboarding
          onBack={me?.guest ? undefined : () => void logout()}
          onSave={async (profile, fixed) => {
            await ledgerApi.saveProfile(profile, fixed, [])
            await loadUser()
            setPage('home')
            notify('내 생활비 준비가 끝났어요.')
          }}
        />
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
            {ledger.budget.provisional && <i />}
          </button>
        </header>
        {ledger.guest && (
          <div className="demo-banner">
            <span>예시 데이터로 둘러보는 중</span>
            <button onClick={() => open({ type: 'reset' })}>
              내 예산으로 시작 <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        {connection !== 'online' && (
          <div className="storage-error" role="alert">
            {connection === 'offline'
              ? '서버에 연결할 수 없어요. 지금 보이는 금액은 마지막으로 불러온 값이에요.'
              : '서버가 데이터베이스를 준비하고 있어요. 잠시 후 다시 시도해주세요.'}{' '}
            <button
              className="text-button"
              onClick={() => void reload().catch((e) => notify(errorMessage(e)))}
            >
              다시 시도
            </button>
          </div>
        )}
        <main className="main-content" key={page}>
          {page === 'home' ? (
            <HomePage ledger={ledger} open={open} navigate={setPage} />
          ) : page === 'plans' ? (
            <PlansPage ledger={ledger} open={open} />
          ) : page === 'records' ? (
            <RecordsPage ledger={ledger} open={open} />
          ) : (
            <SettingsPage
              ledger={ledger}
              open={open}
              onExport={exportData}
              onLogout={() => void logout()}
              run={run}
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
            {modal.type === 'budget' && <BudgetDetail ledger={ledger} open={open} />}
            {modal.type === 'profile' && (
              <ProfileForm
                ledger={ledger}
                onSave={(profile, fixed) =>
                  act(() => ledgerApi.saveProfile(profile, fixed, ledger.fixed), '예산 설정을 반영했어요.')
                }
              />
            )}
            {modal.type === 'plan' && (
              <PlanForm
                ledger={ledger}
                initial={modal.plan}
                onSave={(plan) =>
                  act(
                    () => ledgerApi.savePlan(plan),
                    plan.confirmed
                      ? '계획 비용을 챙기고 생활비를 다시 계산했어요.'
                      : '미확정 계획으로 저장했어요.',
                  )
                }
              />
            )}
            {modal.type === 'planDetail' && (
              <PlanDetail
                ledger={ledger}
                plan={ledger.plans.find((p) => p.id === modal.plan.id) || modal.plan}
                open={open}
                onDelete={() =>
                  run(
                    () => ledgerApi.deletePlan(modal.plan.id),
                    '계획을 취소하고 확보액을 생활비로 돌렸어요.',
                  )
                }
              />
            )}
            {modal.type === 'transaction' && (
              <TransactionForm
                ledger={ledger}
                planId={modal.planId}
                fixedId={modal.fixedId}
                initial={modal.initial}
                onSave={(tx, isNew) =>
                  act(
                    () => (isNew ? ledgerApi.createTransaction(tx) : ledgerApi.replaceTransaction(tx)),
                    '거래를 반영했어요.',
                  )
                }
              />
            )}
            {modal.type === 'transactionDetail' && (
              <TransactionDetail
                ledger={ledger}
                tx={modal.tx}
                open={open}
                onDelete={() =>
                  run(() => ledgerApi.deleteTransaction(modal.tx.id), '거래를 삭제하고 잔액을 되돌렸어요.')
                }
              />
            )}
            {modal.type === 'capture' && (
              <CaptureForm
                ledger={ledger}
                onSaved={(count) =>
                  void run(
                    async () => {},
                    `확인한 거래 ${count}건을 반영했어요. 원본 이미지는 보관하지 않아요.`,
                  )
                }
              />
            )}
            {modal.type === 'csv' && (
              <CsvForm
                ledger={ledger}
                onSaved={(count) => void run(async () => {}, `CSV에서 확인한 거래 ${count}건을 반영했어요.`)}
              />
            )}
            {modal.type === 'bankSync' && <BankSyncInfo />}
            {modal.type === 'reconcile' && (
              <Reconcile
                ledger={ledger}
                open={open}
                onSave={(date) =>
                  act(() => ledgerApi.reconcile(date), '정산 완료! 남은 생활비를 다시 확인해보세요.')
                }
              />
            )}
            {modal.type === 'notifications' && <Notifications ledger={ledger} open={open} />}
            {modal.type === 'calendarImport' && (
              <CalendarImport
                ledger={ledger}
                onSave={(items) =>
                  act(async () => {
                    for (const item of items)
                      await ledgerApi.savePlan({
                        id: uid(),
                        title: item.title,
                        date: item.date,
                        amount: 0,
                        confirmed: false,
                        category: '약속',
                        note: '캘린더에서 가져온 일정 · 내 부담 금액 확인 필요',
                      })
                  }, '일정을 미확정 계획으로 불러왔어요. 금액을 확인하고 확정해주세요.')
                }
              />
            )}
            {modal.type === 'memory' && (
              <MemoryForm
                initial={modal.memory}
                onSave={(memory) => act(() => ledgerApi.saveMemory(memory), '기억할 내용을 저장했어요.')}
                onDelete={
                  modal.memory
                    ? () => run(() => ledgerApi.deleteMemory(modal.memory!.id), '메모를 삭제했어요.')
                    : undefined
                }
              />
            )}
            {modal.type === 'help' && <Help />}
            {modal.type === 'demoImport' && (
              <DemoImport
                ledger={ledger}
                onSave={(task) => act(task, '시연 거래를 반영했어요. 실제 금융 데이터가 아니에요.')}
              />
            )}
            {modal.type === 'reset' && (
              <ResetConfirm
                ledger={ledger}
                onExport={exportData}
                onSignUp={() => void logout().then(() => setPhase('auth'))}
                onReset={() =>
                  run(async () => {
                    await ledgerApi.reset()
                    setPage('home')
                  }, '모든 기록을 지웠어요. 예산을 새로 설정해주세요.')
                }
              />
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
  ledger,
  open,
  navigate,
}: {
  ledger: Ledger
  open: (m: Modal) => void
  navigate: (p: Page) => void
}) {
  const b = ledger.budget
  const today = b.today
  const upcoming = ledger.plans
    .filter((p) => p.confirmed && !p.closed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2)
  const generalToday = ledger.transactions.filter(
    (t) => t.date === today && t.kind === 'expense' && !t.planId && !t.fixedId,
  )
  return (
    <>
      <div className="greeting">
        <p>{dateLabel(today)}</p>
        <h1>
          {ledger.profile.name}님,
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
        {ledger.lastReconciled
          ? new Date(ledger.lastReconciled).toLocaleString('ko-KR', {
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
        <button onClick={() => open({ type: 'csv' })}>
          <span className="quick-icon lilac">
            <FileSpreadsheet size={23} />
          </span>
          <strong>CSV 업로드</strong>
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
            <span className="count">{ledger.plans.filter((p) => p.confirmed && !p.closed).length}</span>
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
                    {p.date >= ledger.profile.incomeDate
                      ? '다음 구간에 보관 중'
                      : p.date < today
                        ? '실제 결제내역 확인 필요'
                        : `${p.category} · 예산 확보 완료`}
                  </small>
                </span>
                <span className="row-value">
                  {won(p.remaining)}
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
                width: `${Math.min(100, (Math.max(0, b.rawRemaining) / Math.max(1, b.balance)) * 100)}%`,
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

function PlansPage({ ledger, open }: { ledger: Ledger; open: (m: Modal) => void }) {
  const today = ledger.budget.today
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
  const items = ledger.plans
    .filter(
      (p) =>
        (!selectedDate || p.date === selectedDate) &&
        (filter === 'all' || filter === 'closed'
          ? filter === 'all' || p.closed
          : !p.closed && p.confirmed === (filter === 'confirmed')),
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
          <Amount value={ledger.budget.plannedReserve} />
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
            const hasPlan = ledger.plans.some((p) => p.date === date)
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
                <span className={`badge ${p.closed ? 'gray' : p.confirmed ? 'mint' : 'sand'}`}>
                  {p.closed ? '정산 완료' : p.confirmed ? '확정' : '미확정'}
                </span>
              </div>
              <h3>{p.title}</h3>
              <p>
                {dateLabel(p.date)}
                <span>{p.category}</span>
              </p>
              <div className="plan-card-bottom">
                <strong>
                  <Amount value={p.closed ? p.actual : p.amount} />
                </strong>
                <span>
                  {p.closed
                    ? '실제 사용'
                    : p.date >= ledger.profile.incomeDate
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

function RecordsPage({ ledger, open }: { ledger: Ledger; open: (m: Modal) => void }) {
  const today = ledger.budget.today
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  // 차트 표시용 합계 (예산 계산에는 쓰지 않는다)
  const spent = (date: string) =>
    ledger.transactions
      .filter((t) => t.date === date)
      .reduce((n, t) => n + (t.kind === 'expense' ? t.amount : t.kind === 'refund' ? -t.amount : 0), 0)
  const max = Math.max(1, ...weekDates.map(spent))
  const total = weekDates.reduce((n, d) => n + spent(d), 0)
  const items = ledger.transactions
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
          내 거래내역 <span className="count">{ledger.transactions.length}</span>
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
              <span>{ledger.reconciledDates.includes(d) ? '정산 완료' : '확인 전'}</span>
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
      <button className="reconcile-callout" onClick={() => open({ type: 'bankSync' })}>
        <span className="item-icon blue">
          <RefreshCw size={20} />
        </span>
        <span>
          <strong>계좌 내역 업데이트</strong>
          <small>연결한 계좌의 최근 거래를 불러와요</small>
        </span>
        <ChevronRight size={19} />
      </button>
      <button className="demo-link" onClick={() => open({ type: 'demoImport' })}>
        금융 연동 대신 예시 내역으로 시연하기
      </button>
      <p className="footer-note">CSV, 캡처로 가져온 거래는 중복을 확인한 뒤 반영해요.</p>
    </>
  )
}

function SettingsPage({
  ledger,
  open,
  onExport,
  onLogout,
  run,
  notify,
}: {
  ledger: Ledger
  open: (m: Modal) => void
  onExport: () => void
  onLogout: () => void
  run: (task: () => Promise<unknown>, message: string) => Promise<void>
  notify: (s: string) => void
}) {
  const b = ledger.budget
  const saveSettings = (time: string, enabled: boolean, message: string) =>
    run(() => ledgerApi.saveSettings(time, enabled), message)
  const requestNotifications = async () => {
    if (ledger.notifications) return saveSettings(ledger.notificationTime, false, '정산 알림을 껐어요.')
    if (!('Notification' in window))
      return saveSettings(
        ledger.notificationTime,
        true,
        '앱 안에서 정산 시간을 알려드릴게요. 이 브라우저는 시스템 알림을 지원하지 않아요.',
      )
    try {
      const permission = await Notification.requestPermission()
      await saveSettings(
        ledger.notificationTime,
        true,
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
        <span className="profile-avatar">{ledger.profile.name.slice(0, 1)}</span>
      </div>
      <button className="account-card" onClick={() => open({ type: 'profile' })}>
        <span className="item-icon mint">
          <Wallet size={22} />
        </span>
        <span>
          <small>현재 사용 가능 잔액</small>
          <strong>
            <Amount value={ledger.profile.balance} />
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
          subtitle={`${dateLabel(ledger.profile.incomeDate)} · 입금 전에는 예산에서 제외`}
          value={`${won(ledger.profile.incomeAmount)}원`}
        />
        <Row
          icon={ReceiptText}
          color="peach"
          title="미납 고정지출"
          subtitle={`${ledger.fixed.length}개 항목 등록`}
          value={`${won(b.fixedReserve)}원`}
          onClick={() => open({ type: 'budget' })}
        />
        <Row
          icon={ShieldCheck}
          color="lilac"
          title="보호할 돈"
          subtitle={`${ledger.profile.protectionCycle} 검토 · 현재 구간 총액`}
          value={`${won(ledger.profile.protectedAmount)}원`}
        />
        <Row
          icon={Wallet}
          color="sand"
          title="미결제 카드액"
          value={`${won(ledger.profile.cardOutstanding)}원`}
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
        {ledger.memories.length ? (
          ledger.memories.map((m) => (
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
            className={`switch ${ledger.notifications ? 'on' : ''}`}
            aria-label="정산 알림"
            role="switch"
            aria-checked={ledger.notifications}
            onClick={() => void requestNotifications()}
          >
            <span />
          </button>
        </div>
        <Field label="알림 받을 시간">
          <input
            type="time"
            defaultValue={ledger.notificationTime}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== ledger.notificationTime)
                void saveSettings(e.target.value, ledger.notifications, '알림 시간을 바꿨어요.')
            }}
          />
        </Field>
        <p className="field-hint">
          앱을 닫은 상태의 푸시에는 서버 연결이 필요해요. iPhone 시스템 알림은 홈 화면 설치와 브라우저 지원이
          필요할 수 있어요.
        </p>
        {ledger.notifications && (
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
        <h2>내 계정과 데이터</h2>
        <Row
          icon={UserRound}
          title={ledger.guest ? '가입 없이 둘러보는 중' : ledger.email || '내 계정'}
          subtitle={ledger.guest ? '예시 데이터예요. 내 예산은 가입 후 시작해요.' : '기록은 계정에 저장돼요'}
        />
        <Row
          icon={Download}
          title="내 데이터 내려받기"
          subtitle="예산과 모든 기록을 JSON 파일로 보관"
          value={<ChevronRight size={18} />}
          onClick={onExport}
        />
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
          title={ledger.guest ? '내 예산으로 시작' : '모든 기록 초기화'}
          value={<ChevronRight size={18} />}
          onClick={() => open({ type: 'reset' })}
        />
        <Row
          icon={LogOut}
          color="sand"
          title="로그아웃"
          value={<ChevronRight size={18} />}
          onClick={onLogout}
        />
      </section>
      <div className="privacy-card">
        <LockKeyhole size={18} />
        <p>
          기록은 내 계정에 저장돼요.
          <br />
          로그인 정보는 이 기기에 오래 보관하지 않아요.
        </p>
      </div>
      <div className="settings-footer">
        <Brand />
        <span>나답게 쓰는 매일 · v1.1</span>
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
function BudgetDetail({ ledger, open }: { ledger: Ledger; open: (m: Modal) => void }) {
  const b = ledger.budget
  return (
    <div className="form-stack">
      <div className="detail-hero">
        <span>오늘부터 {dateLabel(addDays(b.incomeDate, -1))}까지</span>
        <h2>
          하루 <Amount value={b.daily} />
        </h2>
        <p>남은 생활비를 오늘 포함 {Math.max(0, b.days)}일로 나눠요.</p>
      </div>
      <div className="calculation">
        <div>
          <span>현재 사용 가능 잔액</span>
          <strong>{won(b.balance)}원</strong>
        </div>
        {[
          { title: '미납 고정지출', amount: b.fixedReserve },
          { title: '미결제 카드 이용액', amount: Math.max(0, b.cardOutstanding) },
          { title: '보호할 저축 · 비상금', amount: b.protectedAmount },
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
      {ledger.fixed.length ? (
        ledger.fixed.map((f) => (
          <Row
            key={f.id}
            title={f.title}
            subtitle={`${dateLabel(f.date)} · ${f.closed ? '납부 완료' : f.nextPeriod ? '다음 구간' : '미납'}`}
            value={`${won(f.remaining)}원`}
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
  ledger,
  plan,
  open,
  onDelete,
}: {
  ledger: Ledger
  plan: PlanView
  open: (m: Modal) => void
  onDelete: () => void
}) {
  const [cancel, setCancel] = useState(false)
  const linked = ledger.transactions.filter((t) => t.planId === plan.id)
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
          <strong>{won(plan.actual)}원</strong>
        </div>
        <div>
          <span>{plan.closed ? '생활비로 돌려준 차액' : '남은 확보액'}</span>
          <strong className="green">{won(plan.closed ? plan.amount - plan.actual : plan.remaining)}원</strong>
        </div>
      </div>
      {plan.closed ? (
        <p className="info-box">
          <CheckCheck size={18} />
          정산 완료.{' '}
          {plan.amount >= plan.actual
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
          {plan.date >= ledger.budget.today && (
            <Button variant="quiet" onClick={() => void addPlanToCalendar(plan).catch(() => {})}>
              <CalendarDays size={17} />
              {isNative ? '휴대폰 캘린더에 추가' : 'Google 캘린더에 추가'}
            </Button>
          )}
        </>
      )}
      {linked.map((t) => (
        <TransactionRow key={t.id} tx={t} onClick={() => open({ type: 'transactionDetail', tx: t })} />
      ))}
      {!linked.length &&
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
  ledger,
  tx,
  open,
  onDelete,
}: {
  ledger: Ledger
  tx: Transaction
  open: (m: Modal) => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const link =
    ledger.plans.find((p) => p.id === tx.planId)?.title ||
    ledger.fixed.find((f) => f.id === tx.fixedId)?.title
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
      <Row title="입력 방식" value={sourceLabels[tx.source]} />
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
  ledger,
  open,
  onSave,
}: {
  ledger: Ledger
  open: (m: Modal) => void
  onSave: (date: string) => Promise<void>
}) {
  const today = ledger.budget.today
  const pending = ledger.budget.pending
  const [date, setDate] = useState(pending[0] || addDays(today, -1))
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const transactions = ledger.transactions.filter((t) => t.date === date)
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
      <ErrorText message={error} />
      <Button
        disabled={!checked || !date || date > today}
        onClick={() => onSave(date).catch((e) => setError(errorMessage(e)))}
      >
        {ledger.reconciledDates.includes(date) ? '다시 확인 완료' : '하루 정산 완료'}
        <Check size={17} />
      </Button>
      {ledger.lastReconciled && (
        <p className="field-hint">마지막 확인: {new Date(ledger.lastReconciled).toLocaleString('ko-KR')}</p>
      )}
    </div>
  )
}
function Notifications({ ledger, open }: { ledger: Ledger; open: (m: Modal) => void }) {
  const b = ledger.budget
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
      )}
      {b.days <= 0 && (
        <Row
          icon={Landmark}
          title="새 수입 구간을 설정해주세요"
          subtitle="실제 입금 기록 후 다음 수입일을 수정해주세요."
          onClick={() => open({ type: 'profile' })}
        />
      )}
      {ledger.plans
        .filter((p) => p.confirmed && p.date < b.today && !p.closed)
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
  onSave: (m: Memory) => Promise<void>
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [text, setText] = useState(initial?.text || '')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() && text.trim())
          onSave({ id: initial?.id || uid(), title: title.trim(), text: text.trim() }).catch((err) =>
            setError(errorMessage(err)),
          )
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
      <ErrorText message={error} />
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
function CalendarImport({
  ledger,
  onSave,
}: {
  ledger: Ledger
  onSave: (items: Array<{ title: string; date: string }>) => Promise<void>
}) {
  const today = ledger.budget.today
  const sources = [
    ...(deviceCalendarAvailable ? [{ key: 'device', label: '휴대폰 캘린더' } as const] : []),
    ...(googleCalendarAvailable ? [{ key: 'google', label: 'Google 캘린더' } as const] : []),
    { key: 'file', label: '.ics 파일' } as const,
  ]
  const [source, setSource] = useState<(typeof sources)[number]['key']>(sources[0].key)
  const [items, setItems] = useState<Array<{ title: string; date: string; selected: boolean }>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const exists = (item: { title: string; date: string }) =>
    ledger.plans.some((p) => p.title === item.title && p.date === item.date)
  /** 어느 출처든 오늘 이후 일정만, 같은 날 같은 제목은 한 번만 보여준다. */
  const show = (events: Array<{ title: string; date: string }>) => {
    const upcoming = events.filter((p) => p.date >= today)
    const unique = upcoming.filter(
      (p, i) => upcoming.findIndex((x) => x.title === p.title && x.date === p.date) === i,
    )
    if (!unique.length) throw new Error('오늘 이후의 일정을 찾지 못했어요.')
    setItems(unique.map((p) => ({ ...p, title: p.title.slice(0, 60), selected: !exists(p) })))
    setError('')
  }
  const load = async (task: () => Promise<Array<{ title: string; date: string }>>) => {
    setBusy(true)
    setItems([])
    try {
      show(await task())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="form-stack">
      <p>캘린더 일정을 금액이 없는 미확정 계획으로 불러와요. 내 부담 금액을 확인한 뒤 확정해주세요.</p>
      {sources.length > 1 && (
        <div className="segmented">
          {sources.map((s) => (
            <button
              type="button"
              key={s.key}
              className={source === s.key ? 'selected' : ''}
              onClick={() => {
                setSource(s.key)
                setItems([])
                setError('')
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {source === 'file' ? (
        <label className="upload-zone">
          <Upload size={28} />
          <strong>캘린더 파일 선택</strong>
          <span>.ics · 1MB 이하</span>
          <input
            aria-label="캘린더 파일 선택"
            type="file"
            accept=".ics,text/calendar"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              void load(async () => {
                if (file.size > 1e6) throw new Error('1MB 이하 파일을 선택해주세요.')
                return parseCalendar(await file.text())
              })
            }}
          />
        </label>
      ) : (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void load(() => (source === 'device' ? deviceEvents(today) : googleEvents(today)))}
        >
          <CalendarDays size={17} />
          {busy ? '일정을 불러오는 중' : `앞으로 60일 일정 불러오기`}
        </Button>
      )}
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
              {exists(item) ? ' · 이미 등록된 일정' : ''}
            </small>
          </span>
        </label>
      ))}
      <p className="field-hint">
        {source === 'device'
          ? '기기에 동기화된 Google 계정 캘린더도 함께 읽어요. 처음에는 캘린더 읽기 권한을 물어봐요.'
          : source === 'google'
            ? 'Google 캘린더는 읽기 권한만 받고, 이번 가져오기가 끝나면 권한을 보관하지 않아요.'
            : '반복 일정은 파일에 명시된 시작일만 불러오며, 반복 규칙은 펼치지 않아요.'}{' '}
        자동 동기화는 하지 않아요.
      </p>
      <ErrorText message={error} />
      <Button
        disabled={busy || !items.some((i) => i.selected)}
        onClick={() => {
          setBusy(true)
          onSave(items.filter((i) => i.selected))
            .catch((e) => setError(errorMessage(e)))
            .finally(() => setBusy(false))
        }}
      >
        선택 일정 불러오기
      </Button>
    </div>
  )
}
function DemoImport({
  ledger,
  onSave,
}: {
  ledger: Ledger
  onSave: (task: () => Promise<void>) => Promise<void>
}) {
  const date = addDays(ledger.budget.today, -1)
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
        onClick={() =>
          onSave(async () => {
            for (const t of examples)
              if (
                (await ledgerApi.duplicates({ ...t, date, kind: 'expense' })).some((d) => d.level === 'EXACT')
              )
                throw new Error('이미 같은 예시 거래가 있어요. 중복 반영하지 않았어요.')
            for (const t of examples)
              await ledgerApi.createTransaction({
                ...t,
                id: uid(),
                date,
                kind: 'expense',
                method: 'cash',
                source: 'demo',
              })
          }).catch((e) => setError(errorMessage(e)))
        }
      >
        예시 거래 2건 반영
      </Button>
    </div>
  )
}
function ResetConfirm({
  ledger,
  onExport,
  onSignUp,
  onReset,
}: {
  ledger: Ledger
  onExport: () => void
  onSignUp: () => void
  onReset: () => void
}) {
  if (ledger.guest)
    return (
      <div className="form-stack">
        <span className="intro-icon">
          <UserRound />
        </span>
        <h2>내 예산으로 시작할까요?</h2>
        <p>둘러보던 예시 데이터는 두고, 계정을 만들어 내 잔액과 수입일부터 설정해요.</p>
        <Button onClick={onSignUp}>
          가입하고 시작하기
          <ArrowRight size={17} />
        </Button>
      </div>
    )
  return (
    <div className="form-stack">
      <span className="intro-icon">
        <RefreshCw />
      </span>
      <h2>모든 기록을 지우고 새로 시작할까요?</h2>
      <p>계정에 저장된 예산, 계획, 거래, 메모가 모두 삭제돼요. 보관할 기록은 먼저 내려받아주세요.</p>
      <Button variant="secondary" onClick={onExport}>
        <Download size={17} />
        기존 데이터 내려받기
      </Button>
      <Button variant="danger" onClick={onReset}>
        모든 기록 지우고 시작
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
      <h3>같은 결제를 두 번 넣지 않아요</h3>
      <p>
        캡처·CSV·직접 입력으로 이미 있는 결제와 같아 보이는 거래를 추가하면 한 번 더 물어봐요. 가맹점 표기가
        조금 달라도 같은 날 같은 금액이면 확인해요.
      </p>
      <h3>다음 수입일이 되면</h3>
      <p>
        실제 입금을 ‘수입’ 거래로 기록한 뒤 다음 수입일과 고정지출을 다시 설정해주세요. 수입 구간과 고정지출은
        자동 반복하지 않아요. 입금 예정액을 미리 쓸 수 있는 돈으로 취급하지 않아요.
      </p>
      <h3>데이터 보관</h3>
      <p>
        예산과 기록은 계정에 저장돼 다른 기기에서도 이어서 볼 수 있어요. 캡처 원본은 저장하지 않아요. 서버에
        연결되지 않으면 마지막으로 불러온 금액을 보여주고, 변경은 연결된 뒤에 할 수 있어요.
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
    csv: 'CSV로 거래 가져오기',
    bankSync: '계좌 내역 업데이트',
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
