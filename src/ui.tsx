import { useEffect, useRef, type ReactNode } from 'react'
import {
  ArrowUpRight,
  X,
  Utensils,
  Coffee,
  Bus,
  ShoppingBag,
  Ticket,
  Heart,
  House,
  Ellipsis,
  type LucideIcon,
} from 'lucide-react'
import { won, type Category } from './domain'
export function Brand() {
  return (
    <span className="brand">
      <ArrowUpRight strokeWidth={3.3} size={28} />
      <span>
        flex-able<span className="brand-dot">.</span>
      </span>
    </span>
  )
}
export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`button ${variant} ${className}`}>
      {children}
    </button>
  )
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function MoneyInput({
  value,
  onChange,
  required = false,
  min = 0,
  label,
}: {
  value: number
  onChange: (n: number) => void
  required?: boolean
  min?: number
  label?: string
}) {
  return (
    <span className="money-input">
      <input
        aria-label={label}
        inputMode="numeric"
        type="number"
        min={min}
        max={1e12}
        step="1"
        required={required}
        value={value || ''}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>원</span>
    </span>
  )
}
export function Row({
  title,
  subtitle,
  value,
  onClick,
  icon: Icon,
  color = 'mint',
}: {
  title: string
  subtitle?: string
  value?: ReactNode
  onClick?: () => void
  icon?: LucideIcon
  color?: string
}) {
  const content = (
    <>
      {Icon && (
        <span className={`item-icon ${color}`}>
          <Icon size={20} />
        </span>
      )}
      <span className="row-copy">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {value && <span className="row-value">{value}</span>}
    </>
  )
  return onClick ? (
    <button className="list-row" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="list-row">{content}</div>
  )
}
const categoryIcons: Record<Category, LucideIcon> = {
  식비: Utensils,
  카페: Coffee,
  교통: Bus,
  쇼핑: ShoppingBag,
  문화: Ticket,
  약속: Heart,
  주거: House,
  기타: Ellipsis,
}
const categoryColors: Record<Category, string> = {
  식비: 'peach',
  카페: 'sand',
  교통: 'blue',
  쇼핑: 'lilac',
  문화: 'yellow',
  약속: 'pink',
  주거: 'mint',
  기타: 'gray',
}
export function CategoryIcon({ category }: { category: Category }) {
  const Icon = categoryIcons[category]
  return (
    <span className={`item-icon ${categoryColors[category]}`}>
      <Icon size={21} strokeWidth={1.8} />
    </span>
  )
}
export function Amount({ value, unit = true }: { value: number; unit?: boolean }) {
  return (
    <>
      {won(value)}
      {unit && <span className="unit">원</span>}
    </>
  )
}
export function Empty({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-doodle">
        <ArrowUpRight size={30} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  )
}
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const node = ref.current!
    node.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab') {
        const focusable = Array.from(
          node.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]',
          ),
        ).filter((el) => el.getClientRects().length)
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === node)) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handler)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="sheet">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={22} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <p className="error-text" role="alert">
      {message}
    </p>
  ) : null
}
