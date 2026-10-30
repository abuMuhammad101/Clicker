import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDate,
  fromISO,
  monthName,
  parseDateText,
  startOfMonth,
  todayISO,
  weekdayMondayFirst,
} from '@/lib/dates'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, emptyPrompt, type FieldProps } from '../shared/types'
import './date.css'

interface DateFieldProps extends FieldProps<string> {
  /** ISO bounds from the model's validators. */
  min?: string
  max?: string
  computed?: { description: string }
  /** Gallery-only: keep the calendar open. */
  forceOpen?: boolean
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/**
 * A date. Type it day-first (30/10/2026, 30-10-26, "30 oct", "today"), or
 * pick it: presets beside a month calendar. Stored as ISO, shown as
 * "30 Oct 2026". Keyboard in the calendar: arrows move a day or a week,
 * PageUp/PageDown a month, Enter picks, Esc closes.
 */
export function DateField({
  name,
  label,
  value,
  onChange,
  min,
  max,
  computed,
  required,
  disabled,
  readOnly,
  loading,
  error,
  helpText,
  placeholder,
  dirty,
  forceFocused,
  forceOpen,
}: DateFieldProps) {
  // What's in the box: the person's own text while they type, otherwise the
  // committed value, formatted. Derived, so a new value never needs syncing.
  const [typed, setTyped] = useState('')
  const [typing, setTyping] = useState(false)
  const text = typing ? typed : formatDate(value)
  const setText = (next: string) => setTyped(next)
  const [invalid, setInvalid] = useState(false)
  const [openState, setOpenState] = useState(false)
  const open = forceOpen ?? openState

  if (loading) {
    return (
      <FieldShell label={label} required={required} computed={computed}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }

  const outOfRange = (iso: string) => (min != null && iso < min) || (max != null && iso > max)

  const commit = (raw: string) => {
    setTyping(false)
    if (raw.trim() === '') {
      setInvalid(false)
      onChange?.(null)
      setText('')
      return
    }
    const iso = parseDateText(raw)
    if (iso == null || outOfRange(iso)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onChange?.(iso)
    setText(formatDate(iso))
  }

  const pick = (iso: string) => {
    setInvalid(false)
    setTyping(false)
    onChange?.(iso)
    setText(formatDate(iso))
    setOpenState(false)
  }

  const localError = invalid
    ? min || max
      ? `Type a date like 30/10/2026, between ${formatDate(min) || 'any'} and ${formatDate(max) || 'any'}.`
      : 'Type a date like 30/10/2026, or “today”.'
    : undefined

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      required={required}
      error={error ?? localError}
      helpText={helpText}
      readOnly={readOnly}
      dirty={dirty}
      computed={computed}
      readOnlyValue={value ? <time dateTime={value} className="tabular-nums">{formatDate(value)}</time> : undefined}
    >
      <Popover open={open} onOpenChange={setOpenState}>
        {/* The calendar opens under the whole box, aligned to its left edge. */}
        <PopoverAnchor asChild>
        <div className="date-input">
          <Input
            id={name}
            value={text}
            onChange={(event) => {
              setTyping(true)
              setText(event.target.value)
            }}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit(event.currentTarget.value)
              } else if (event.key === 'ArrowDown' && event.altKey) {
                event.preventDefault()
                setOpenState(true)
              }
            }}
            disabled={disabled}
            placeholder={placeholder ?? emptyPrompt(label)}
            aria-invalid={!!(error ?? localError)}
            aria-describedby={undefined}
            className={cn('tabular-nums', forceFocused && FORCE_FOCUS_CLASSES)}
            autoComplete="off"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              className="date-input__button"
              aria-label={`Choose ${label.toLowerCase()} from a calendar`}
              disabled={disabled}
            >
              <CalendarDays aria-hidden />
            </button>
          </PopoverTrigger>
        </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="date-picker" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DatePicker value={value} min={min} max={max} onPick={pick} autoFocus={!forceOpen} />
        </PopoverContent>
      </Popover>
    </FieldShell>
  )
}

interface DatePickerProps {
  value: string | null
  min?: string
  max?: string
  onPick: (iso: string) => void
  autoFocus?: boolean
}

/** Presets beside a month: the shortcuts people actually reach for, then the grid. */
function DatePicker({ value, min, max, onPick, autoFocus = true }: DatePickerProps) {
  const today = todayISO()
  const [focused, setFocused] = useState(() => (value && fromISO(value) ? value : today))
  const grid = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    grid.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`)?.focus()
  }, [focused, autoFocus])

  const allowed = (iso: string) => !((min != null && iso < min) || (max != null && iso > max))
  const presets: [string, string][] = [
    ['Today', today],
    ['Yesterday', addDays(today, -1)],
    ['Start of month', startOfMonth(today)],
    ['End of month', endOfMonth(today)],
  ]

  const month = fromISO(focused)!
  const first = startOfMonth(focused)
  const leading = weekdayMondayFirst(first)
  const days: string[] = []
  for (let i = -leading; i < 42 - leading; i++) days.push(addDays(first, i))

  const move = (to: string) => setFocused(to)

  return (
    <div className="date-picker__body">
      <ul className="date-picker__presets" aria-label="Quick picks">
        {presets.map(([label, iso]) => (
          <li key={label}>
            <button
              type="button"
              className={cn('date-picker__preset', value === iso && 'date-picker__preset--on')}
              disabled={!allowed(iso)}
              onClick={() => onPick(iso)}
            >
              <span>{label}</span>
              <span className="date-picker__preset-date">{formatDate(iso)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="date-picker__month">
        <div className="date-picker__head">
          <button type="button" className="date-picker__nav" onClick={() => move(addMonths(focused, -1))} aria-label="Previous month">
            <ChevronLeft aria-hidden />
          </button>
          <span className="date-picker__title" aria-live="polite">
            {monthName(month.month)} {month.year}
          </span>
          <button type="button" className="date-picker__nav" onClick={() => move(addMonths(focused, 1))} aria-label="Next month">
            <ChevronRight aria-hidden />
          </button>
        </div>
        <div
          ref={grid}
          className="date-picker__grid"
          role="grid"
          aria-label={`${monthName(month.month)} ${month.year}`}
          onKeyDown={(event) => {
            const step: Record<string, () => string> = {
              ArrowLeft: () => addDays(focused, -1),
              ArrowRight: () => addDays(focused, 1),
              ArrowUp: () => addDays(focused, -7),
              ArrowDown: () => addDays(focused, 7),
              PageUp: () => addMonths(focused, -1),
              PageDown: () => addMonths(focused, 1),
              Home: () => startOfMonth(focused),
              End: () => endOfMonth(focused),
            }
            if (step[event.key]) {
              event.preventDefault()
              move(step[event.key]())
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (allowed(focused)) onPick(focused)
            }
          }}
        >
          {WEEKDAYS.map((day) => (
            <span key={day} className="date-picker__weekday" role="columnheader" aria-hidden="true">
              {day}
            </span>
          ))}
          {days.map((iso) => {
            const parts = fromISO(iso)!
            const inMonth = parts.month === month.month
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                data-iso={iso}
                tabIndex={iso === focused ? 0 : -1}
                disabled={!allowed(iso)}
                aria-selected={iso === value}
                aria-label={formatDate(iso)}
                aria-current={iso === today ? 'date' : undefined}
                className={cn(
                  'date-picker__day',
                  !inMonth && 'date-picker__day--outside',
                  iso === today && 'date-picker__day--today',
                  iso === value && 'date-picker__day--selected',
                )}
                onClick={() => onPick(iso)}
                onFocus={() => iso !== focused && setFocused(iso)}
              >
                {parts.day}
              </button>
            )
          })}
        </div>
        <p className="date-picker__hint" aria-hidden="true">
          <kbd className="kbd">←→↑↓</kbd> day <kbd className="kbd">PgUp/PgDn</kbd> month <kbd className="kbd">↵</kbd> pick
        </p>
      </div>
    </div>
  )
}
