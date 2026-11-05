import { useTranslation } from 'react-i18next'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ecMonthBounds, ecToday, ecYearBounds, todayIso } from '@/lib/ethiopian-calendar'

export type PeriodPreset = 'month' | 'quarter' | 'year' | 'all' | 'custom'

/** Gregorian 'YYYY-MM-DD' `days` before today. */
const daysAgo = (days: number) => {
  const d = new Date(`${todayIso()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** A preset period in the Ethiopian calendar (this E.C. month / last 3 months / this E.C. year / all). */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>): { from: string; to: string } {
  const today = ecToday()
  if (preset === 'month') {
    const m = ecMonthBounds(today.year, today.month)
    return { from: m.start, to: m.end }
  }
  if (preset === 'quarter') return { from: daysAgo(90), to: todayIso() }
  if (preset === 'year') {
    const y = ecYearBounds(today.year)
    return { from: y.start, to: y.end }
  }
  return { from: '', to: '' }
}

/**
 * The merged period control: one dropdown of E.C. presets; picking "custom"
 * reveals the from/to date pickers beside it.
 */
export function PeriodFilter({
  preset,
  range,
  onPreset,
  onRange,
  presets = ['month', 'quarter', 'year', 'all', 'custom'],
}: {
  preset: PeriodPreset
  range: { from: string; to: string }
  onPreset: (p: PeriodPreset) => void
  onRange: (r: { from: string; to: string }) => void
  presets?: PeriodPreset[]
}) {
  const { t } = useTranslation()
  return (
    <>
      <Select
        value={preset}
        onValueChange={(v) => {
          const p = v as PeriodPreset
          onPreset(p)
          if (p !== 'custom') onRange(presetRange(p))
        }}
      >
        <SelectTrigger className="w-40" aria-label={t('attendance.member.period')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`attendance.member.presets.${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === 'custom' && (
        <>
          <EthDatePicker
            value={range.from}
            onChange={(v) => onRange({ ...range, from: v })}
            clearable
            placeholder={t('attendance.filters.from')}
            className="w-40"
          />
          <EthDatePicker
            value={range.to}
            onChange={(v) => onRange({ ...range, to: v })}
            clearable
            placeholder={t('attendance.filters.to')}
            className="w-40"
          />
        </>
      )}
    </>
  )
}
