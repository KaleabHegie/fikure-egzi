import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { Button } from '@/components/ui/button'
import { ecMonthName, gcToEc } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { addisToday, shiftDay, SIDE_DAYS } from '../time'

/** Sunday-first, as Date#getUTCDay counts. */
const WEEKDAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  am: ['እሑድ', 'ሰኞ', 'ማክሰ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'],
}

/**
 * The chosen day with three days either side, ‹ › to step a week back or on,
 * and a calendar to jump to any day. A dot marks the days that have sessions.
 */
export function DayStrip({
  day,
  onDay,
  counts,
}: {
  /** Gregorian 'YYYY-MM-DD'. */
  day: string
  onDay: (day: string) => void
  /** Sessions per day ('YYYY-MM-DD' → count) for the days shown. */
  counts: Record<string, number>
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'am'
  const today = addisToday()
  const days = Array.from({ length: SIDE_DAYS * 2 + 1 }, (_, i) => shiftDay(day, i - SIDE_DAYS))
  const week = SIDE_DAYS * 2 + 1

  return (
    <div className="space-y-2.5 border-b p-3">
      <div className="flex flex-wrap items-center gap-2">
        <EthDatePicker value={day} onChange={(v) => v && onDay(v)} className="w-auto min-w-48" />
        {day !== today && (
          <Button variant="outline" size="sm" onClick={() => onDay(today)}>
            {t('attendance.days.today')}
          </Button>
        )}
      </div>
      <div className="flex items-stretch gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-auto shrink-0 self-stretch"
          onClick={() => onDay(shiftDay(day, -week))}
          aria-label={t('attendance.days.previous', { count: week })}
          title={t('attendance.days.previous', { count: week })}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <ol className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => {
            const ec = gcToEc(d)
            const n = counts[d] ?? 0
            const on = d === day
            const isToday = d === today
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  aria-pressed={on}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${WEEKDAYS[lang][new Date(`${d}T00:00:00Z`).getUTCDay()]} ${ec ? `${ecMonthName(ec.month, lang)} ${ec.day}` : d}${n > 0 ? ` · ${t('attendance.days.sessions', { count: n })}` : ''}`}
                  className={cn(
                    'flex w-full flex-col items-center rounded-lg border px-0.5 py-1.5 transition-colors outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring/40',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/40',
                    !on && isToday && 'border-brand/60',
                  )}
                >
                  <span className={cn('text-[10px] leading-tight', on ? 'opacity-85' : isToday ? 'font-medium text-brand' : 'text-muted-foreground')}>
                    {isToday ? t('attendance.days.today') : WEEKDAYS[lang][new Date(`${d}T00:00:00Z`).getUTCDay()]}
                  </span>
                  <span className="tabular font-record text-lg leading-tight font-semibold">{ec?.day}</span>
                  <span className={cn('max-w-full truncate text-[10px] leading-tight', on ? 'opacity-85' : 'text-muted-foreground')}>
                    {ec && ecMonthName(ec.month, lang)}
                  </span>
                  <span
                    className={cn(
                      'mt-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular',
                      n === 0 && 'invisible',
                      on ? 'bg-primary-foreground text-primary' : 'bg-brand/15 text-brand',
                    )}
                    aria-hidden
                  >
                    {n}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-auto shrink-0 self-stretch"
          onClick={() => onDay(shiftDay(day, week))}
          aria-label={t('attendance.days.next', { count: week })}
          title={t('attendance.days.next', { count: week })}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  )
}
