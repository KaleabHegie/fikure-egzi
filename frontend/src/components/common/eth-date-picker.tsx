import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ecMonthDays,
  ecMonthName,
  ecToGcIso,
  ecToday,
  gcToEc,
} from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'

// Monday-first week; the E.C. week has the same seven days.
const WEEKDAYS = { en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], am: ['ሰኞ', 'ማክ', 'ረቡ', 'ሐሙ', 'ዓር', 'ቅዳ', 'እሑ'] }

/**
 * Ethiopian-calendar date picker (ported from DPMES). The VALUE stays a
 * Gregorian ISO date ("YYYY-MM-DD") so forms and the API are unchanged;
 * only the control's face is E.C. Use this for every date input — never
 * a native date input, which shows the Gregorian calendar.
 */
export function EthDatePicker({
  id,
  value,
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
  clearable = false,
  fromEcYear,
  toEcYear,
  placeholder,
  className,
}: {
  id?: string
  /** Gregorian ISO date ("YYYY-MM-DD") or ''. */
  value: string
  onChange: (iso: string) => void
  onBlur?: () => void
  disabled?: boolean
  invalid?: boolean
  clearable?: boolean
  /** Selectable E.C. year range (defaults to current year − 100 … + 5). */
  fromEcYear?: number
  toEcYear?: number
  placeholder?: string
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'am'
  const today = useMemo(() => ecToday(), [])
  const yearFrom = fromEcYear ?? today.year - 100
  const yearTo = toEcYear ?? today.year + 5
  const selected = value ? gcToEc(value) : null

  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => ({
    year: selected?.year ?? today.year,
    month: selected?.month ?? today.month,
  }))
  // Year is typed, not scrolled: a 100-item dropdown is unusable.
  const [yearDraft, setYearDraft] = useState<string | null>(null)

  const clampYear = (y: number) => Math.min(Math.max(y, yearFrom), yearTo)
  const openTo = (year: number, month: number) => setView({ year: clampYear(year), month })

  const handleOpenChange = (next: boolean) => {
    if (next) openTo(selected?.year ?? today.year, selected?.month ?? today.month)
    else onBlur?.()
    setOpen(next)
  }

  const stepMonth = (delta: number) => {
    let { year, month } = view
    month += delta
    if (month < 1) {
      month = 13
      year -= 1
    } else if (month > 13) {
      month = 1
      year += 1
    }
    if (year >= yearFrom && year <= yearTo) setView({ year, month })
  }

  const commitYear = () => {
    if (yearDraft === null) return
    const parsed = Number(yearDraft)
    if (yearDraft.trim() !== '' && Number.isFinite(parsed)) {
      setView((v) => ({ ...v, year: clampYear(Math.round(parsed)) }))
    }
    setYearDraft(null)
  }

  const select = (iso: string) => {
    onChange(iso)
    setOpen(false)
    onBlur?.()
  }

  const dayCount = ecMonthDays(view.year, view.month)
  // Monday-first column of the month's 1st (JS getDay(): 0 = Sunday).
  const leadingBlanks = (new Date(`${ecToGcIso(view.year, view.month, 1)}T00:00:00`).getDay() + 6) % 7
  const isToday = (day: number) => view.year === today.year && view.month === today.month && day === today.day
  const isSelected = (day: number) =>
    selected !== null && view.year === selected.year && view.month === selected.month && day === selected.day

  const dayLabel = (month: number, day: number, year: number) =>
    lang === 'am' ? `${ecMonthName(month, lang)} ${day} ቀን ${year}` : `${ecMonthName(month, lang)} ${day}, ${year}`
  const label = selected ? dayLabel(selected.month, selected.day, selected.year) : (placeholder ?? t('datePicker.select'))
  const headerControl =
    'h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-haspopup="dialog"
            className={cn(
              'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
              !selected && 'text-muted-foreground',
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-2 p-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('datePicker.previousMonth')}
              onClick={() => stepMonth(-1)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <select
              aria-label={t('datePicker.month')}
              className={cn(headerControl, 'flex-1')}
              value={view.month}
              onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
            >
              {Array.from({ length: 13 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {ecMonthName(m, lang)}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              aria-label={t('datePicker.year')}
              min={yearFrom}
              max={yearTo}
              className={cn(
                headerControl,
                'tabular w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              )}
              value={yearDraft ?? String(view.year)}
              onChange={(e) => {
                const raw = e.target.value
                setYearDraft(raw)
                const parsed = Number(raw)
                // A complete in-range year jumps immediately; anything else waits for blur/Enter.
                if (raw.length === 4 && Number.isInteger(parsed) && parsed >= yearFrom && parsed <= yearTo) {
                  setView((v) => ({ ...v, year: parsed }))
                }
              }}
              onBlur={commitYear}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitYear()
                }
              }}
            />
            <button
              type="button"
              aria-label={t('datePicker.nextMonth')}
              onClick={() => stepMonth(1)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 text-center" role="grid" aria-label={t('datePicker.days')}>
            {WEEKDAYS[lang].map((w) => (
              <span key={w} className="py-1 text-[11px] font-medium text-muted-foreground">
                {w}
              </span>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={isSelected(day)}
                aria-label={dayLabel(view.month, day, view.year)}
                onClick={() => select(ecToGcIso(view.year, view.month, day))}
                className={cn(
                  'tabular mx-auto grid size-8 place-items-center rounded-full text-sm transition-colors',
                  isSelected(day)
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : cn('hover:bg-accent', isToday(day) && 'ring-1 ring-primary/60 ring-inset'),
                )}
              >
                {day}
              </button>
            ))}
          </div>

          <div className="flex justify-between border-t pt-2 text-xs">
            <span className="self-center text-muted-foreground">{t('datePicker.calendar')}</span>
            <button
              type="button"
              onClick={() => select(ecToGcIso(today.year, today.month, today.day))}
              className="rounded-md px-2 py-1 font-medium text-primary hover:bg-accent"
            >
              {t('datePicker.today')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {clearable && value && !disabled && (
        <button
          type="button"
          aria-label={t('datePicker.clear')}
          onClick={() => select('')}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
