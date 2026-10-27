import { CalendarCheck, Info } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ecMonthBounds, ecToday, ecYearBounds, todayIso } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { attendanceApi, attendanceKeys } from '../api'
import { STATUS_STYLES } from '../status-styles'
import { addisEthTime, formatDuration, sessionDate, sessionTimes } from '../time'
import { ATTENDANCE_STATUSES, type MemberAttendanceSummary } from '../types'
import { AttendanceStatusBadge } from './status-badge'

type Preset = 'month' | 'quarter' | 'year' | 'all' | 'custom'

/** Gregorian 'YYYY-MM-DD' `days` before today. */
const daysAgo = (days: number) => {
  const d = new Date(`${todayIso()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** A preset period in the Ethiopian calendar (this E.C. month / last 3 months / this E.C. year / all). */
function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
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
 * A member's attendance for a chosen period (Ethiopian calendar): rate,
 * counts and time attended, then every session as a table.
 */
export function MemberAttendancePanel({
  memberId,
  load,
  linkSessions = true,
}: {
  memberId: number
  /** Where the data comes from (default: the staff API; the member portal passes its own). */
  load?: (range: { from?: string; to?: string }) => Promise<MemberAttendanceSummary>
  /** Session titles link to the session page (staff only). */
  linkSessions?: boolean
}) {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<Preset>('year')
  const [range, setRange] = useState(() => presetRange('year'))
  const period = { from: range.from || undefined, to: range.to || undefined }
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: [...attendanceKeys.member(memberId), load ? 'portal' : 'staff', period],
    queryFn: () => (load ? load(period) : attendanceApi.memberSummary(memberId, period)),
    placeholderData: keepPreviousData,
  })

  const choose = (p: Exclude<Preset, 'custom'>) => {
    setPreset(p)
    setRange(presetRange(p))
  }
  const setDate = (key: 'from' | 'to', value: string) => {
    setPreset('custom')
    setRange((r) => ({ ...r, [key]: value }))
  }

  return (
    <section className="rounded-xl border bg-card p-5 lg:col-span-2">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <CalendarCheck className="size-4 text-muted-foreground" />
          {t('attendance.member.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="group" aria-label={t('attendance.member.period')}>
            {(['month', 'quarter', 'year', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={preset === p}
                onClick={() => choose(p)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  preset === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t(`attendance.member.presets.${p}`)}
              </button>
            ))}
          </div>
          <EthDatePicker
            value={range.from}
            onChange={(v) => setDate('from', v)}
            clearable
            placeholder={t('attendance.filters.from')}
            className="w-40"
          />
          <EthDatePicker
            value={range.to}
            onChange={(v) => setDate('to', v)}
            clearable
            placeholder={t('attendance.filters.to')}
            className="w-40"
          />
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-40" />
      ) : isError ? null : (
        <div className={cn('space-y-4 transition-opacity', isFetching && 'opacity-60')}>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {t('attendance.member.rate')}
                <Tooltip>
                  <TooltipTrigger aria-label={t('attendance.member.rateHint')}>
                    <Info className="size-3" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-60">{t('attendance.member.rateHint')}</TooltipContent>
                </Tooltip>
              </p>
              <p className="tabular text-2xl font-semibold">{data.rate === null ? '—' : `${data.rate}%`}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('attendance.member.timeAttended')}</p>
              <p className="tabular text-2xl font-semibold">{formatDuration(data.minutesAttended, t)}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {t('attendance.member.sessions', { count: data.sessions })}
              </span>
              {ATTENDANCE_STATUSES.map((st) => (
                <span key={st} className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[st]}`}>
                  {t(`attendance.statuses.${st}`)} {data[st.toLowerCase() as 'present']}
                </span>
              ))}
            </div>
          </div>

          {data.records.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('attendance.member.noneInPeriod')}
            </p>
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('attendance.fields.date')}</TableHead>
                    <TableHead>{t('attendance.member.session')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('attendance.import.time')}</TableHead>
                    <TableHead>{t('attendance.member.status')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('attendance.member.checkedIn')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('attendance.member.timeAttended')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t('attendance.fields.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.map((r) => (
                    <TableRow key={r.sessionId}>
                      <TableCell className="text-sm whitespace-nowrap">{sessionDate(r.startsAt)}</TableCell>
                      <TableCell className="text-sm">
                        {linkSessions ? <SessionLink id={r.sessionId}>{r.title}</SessionLink> : <span className="font-medium">{r.title}</span>}
                        <span className="block text-xs text-muted-foreground">{t(`attendance.kinds.${r.kind}`)}</span>
                      </TableCell>
                      <TableCell className="hidden text-sm whitespace-nowrap md:table-cell">
                        {sessionTimes(r.startsAt, r.endsAt)}
                      </TableCell>
                      <TableCell>
                        <AttendanceStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="hidden text-sm whitespace-nowrap sm:table-cell">
                        {r.checkedInAt ? addisEthTime(r.checkedInAt) : '—'}
                      </TableCell>
                      <TableCell className="tabular hidden text-sm whitespace-nowrap sm:table-cell">
                        {r.minutes > 0 ? formatDuration(r.minutes, t) : '—'}
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground lg:table-cell" title={r.note ?? ''}>
                        {r.note ?? ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Session titles link to the session page. */
function SessionLink({ id, children }: { id: number; children: React.ReactNode }) {
  return (
    <Link to={`/attendance/${id}`} className="font-medium hover:underline">
      {children}
    </Link>
  )
}
