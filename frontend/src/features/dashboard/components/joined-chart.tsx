import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ecMonthName } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { type Bucket, bucketByEcMonth } from './ec-buckets'


/** Single-series column chart: one hue (chart-1), thin rounded columns, hover tooltip, table for screen readers. */
export function JoinedChart({ days }: { days: { date: string; count: number }[] }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'am' ? 'am' : 'en'
  const buckets = useMemo(() => bucketByEcMonth(days), [days])
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...buckets.map((b) => b.count))
  // Three recessive gridlines at round values.
  const step = Math.max(1, Math.ceil(max / 3 / 5) * 5)
  const top = step * 3
  const label = (b: Bucket) => `${ecMonthName(b.month, lang)} ${b.year}`
  const short = (b: Bucket) => (lang === 'en' ? ecMonthName(b.month, 'en').slice(0, 3) : ecMonthName(b.month, 'am'))
  const peak = buckets.reduce((best, b, i) => (b.count > (buckets[best]?.count ?? 0) ? i : best), 0)

  return (
    <figure>
      <div className="relative h-52 pl-8" aria-hidden>
        {[0, 1, 2, 3].map((g) => (
          <div
            key={g}
            className="absolute right-0 left-8 border-t border-dashed border-border"
            style={{ bottom: `${(g / 3) * 100}%` }}
          >
            <span className="tabular absolute -top-2 -left-8 w-6 text-right text-[10px] text-muted-foreground">
              {step * g}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 left-8 flex items-end gap-[2px]">
          {buckets.map((b, i) => {
            const pct = (b.count / top) * 100
            const showValue = i === peak || i === buckets.length - 1
            return (
              <div
                key={b.key}
                className="group relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* Hit target is the whole column, wider than the mark. */}
                <div
                  className={cn(
                    'w-full max-w-7 rounded-t-[4px] bg-chart-1 transition-opacity',
                    hover !== null && hover !== i && 'opacity-40',
                  )}
                  style={{ height: `${Math.max(pct, b.count > 0 ? 1.5 : 0)}%` }}
                />
                {showValue && b.count > 0 && hover === null && (
                  <span className="tabular absolute text-[10px] font-medium text-foreground" style={{ bottom: `calc(${pct}% + 2px)` }}>
                    {b.count}
                  </span>
                )}
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md">
                    <div className="text-muted-foreground">{label(b)}</div>
                    <div className="tabular font-semibold">
                      {b.count.toLocaleString()} {t('dashboard.membersJoined').toLowerCase()}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] pl-8" aria-hidden>
        {buckets.map((b, i) => (
          <span
            key={b.key}
            className={cn(
              'flex-1 truncate text-center text-[10px] text-muted-foreground',
              hover === i && 'font-medium text-foreground',
            )}
          >
            {short(b)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t('dashboard.joinedChart')}</caption>
        <thead>
          <tr>
            <th>{t('dashboard.month')}</th>
            <th>{t('dashboard.membersJoined')}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <td>{label(b)}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
