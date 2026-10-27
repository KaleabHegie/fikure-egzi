import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ETH_DAY_PARTS,
  type EthDayPart,
  ethDayPart,
  ethDayPartLabel,
  ethHour,
  hour24FromEth,
} from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

/**
 * Time input on the Ethiopian clock: ቀን (day) or ማታ (night), the hour 1–12,
 * then minutes. The value is still an ordinary 24-hour "HH:mm" (ቀን 2:00 = 08:00),
 * so storage and the API are unchanged.
 */
export function EthTimePicker({
  id,
  value,
  onChange,
  onBlur,
  invalid = false,
  disabled = false,
  className,
}: {
  id?: string
  value: string
  onChange: (hhmm: string) => void
  onBlur?: () => void
  invalid?: boolean
  disabled?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'am' ? 'am' : 'en'
  const valid = /^\d{2}:\d{2}$/.test(value)
  const [h24, minute] = valid ? (value.split(':').map(Number) as [number, number]) : [8, 0]
  const part = ethDayPart(h24)
  const hour = ethHour(h24)
  const set = (p: EthDayPart, h: number, m: number) => onChange(`${pad(hour24FromEth(p, h))}:${pad(m)}`)
  // Keep an existing off-grid minute (e.g. :07) selectable.
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b)

  return (
    <div className={cn('flex gap-2', className)} onBlur={onBlur}>
      <Select value={valid ? part : ''} onValueChange={(v) => set(v as EthDayPart, hour, minute)} disabled={disabled}>
        <SelectTrigger id={id} aria-label={t('common.dayOrNight')} aria-invalid={invalid || undefined} className="min-w-0 flex-1">
          <SelectValue placeholder={t('common.select')} />
        </SelectTrigger>
        <SelectContent>
          {ETH_DAY_PARTS.map((p) => (
            <SelectItem key={p} value={p}>
              {ethDayPartLabel(p, lang)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={valid ? String(hour) : ''} onValueChange={(v) => set(part, Number(v), minute)} disabled={disabled}>
        <SelectTrigger aria-label={t('common.hour')} aria-invalid={invalid || undefined} className="w-16">
          <SelectValue placeholder="–" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={valid ? String(minute) : ''} onValueChange={(v) => set(part, hour, Number(v))} disabled={disabled}>
        <SelectTrigger aria-label={t('common.minutes')} aria-invalid={invalid || undefined} className="w-20">
          <SelectValue placeholder=":00" />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={String(m)}>
              :{pad(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
