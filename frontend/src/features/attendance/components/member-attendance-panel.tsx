import { CalendarCheck, Info } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocalizedName } from '@/features/classes/use-localized'
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
  const deptName = useLocalizedName()
  const [preset, setPreset] = useState<Preset>('year')
  const [range, setRange] = useState(() => presetRange('year'))
  // 'all', or a running department id (0 = the office).
  const [deptFilter, setDeptFilter] = useState<'all' | number>('all')
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

  // What the figures and table show: everything, or one department's share.
  const selected =
    deptFilter === 'all' ? null : (data?.byDepartment?.find((d) => (d.department?.id ?? 0) === deptFilter) ?? null)
  const shown =
    data &&
    (deptFilter === 'all'
      ? data
      : (selected ?? { sessions: 0, rate: null, minutesAttended: 0, present: 0, late: 0, absent: 0, excused: 0 }))
  const shownRecords =
    data?.records.filter((r) => deptFilter === 'all' || (r.department?.id ?? 0) === deptFilter) ?? []

  return (
    <section className="rounded-xl border bg-card p-5 lg:col-span-2">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="size-4 text-muted-foreground" />
          {t('attendance.member.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* One dropdown for the period; the date pickers appear only for a custom range. */}
          <Select
            value={preset}
            onValueChange={(v) => (v === 'custom' ? setPreset('custom') : choose(v as Exclude<Preset, 'custom'>))}
          >
            <SelectTrigger className="w-40" aria-label={t('attendance.member.period')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['month', 'quarter', 'year', 'all', 'custom'] as const).map((p) => (
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
            </>
          )}
          {data?.byDepartment && data.byDepartment.length > 0 && (
            <Select
              value={deptFilter === 'all' ? 'all' : String(deptFilter)}
              onValueChange={(v) => setDeptFilter(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="w-44" aria-label={t('attendance.member.byDepartment')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('attendance.roster.all')}</SelectItem>
                {data.byDepartment.map((d) => (
                  <SelectItem key={d.department?.id ?? 0} value={String(d.department?.id ?? 0)}>
                    {d.department ? deptName(d.department) : t('attendance.member.office')}
                    {d.rate !== null && ` · ${d.rate}%`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
              <p className="tabular font-record text-3xl leading-none font-semibold">
                {shown!.rate === null ? '—' : `${shown!.rate}%`}
              </p>
              {shown!.rate !== null && (
                <div className="relative mt-2 h-1 w-36 rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${shown!.rate}%` }} />
                  <span
                    className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-gold ring-2 ring-card"
                    style={{ left: `${Math.max(shown!.rate, 1)}%` }}
                  />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('attendance.member.timeAttended')}</p>
              <p className="tabular font-record text-3xl leading-none font-semibold">
                {formatDuration(shown!.minutesAttended, t)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {t('attendance.member.sessions', { count: shown!.sessions })}
              </span>
              {ATTENDANCE_STATUSES.map((st) => (
                <span key={st} className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[st]}`}>
                  {t(`attendance.statuses.${st}`)} {shown![st.toLowerCase() as 'present']}
                </span>
              ))}
            </div>
          </div>


          {shownRecords.length === 0 ? (
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
                  {shownRecords.map((r) => (
                    <TableRow key={r.sessionId}>
                      <TableCell className="text-sm whitespace-nowrap">{sessionDate(r.startsAt)}</TableCell>
                      <TableCell className="text-sm">
                        {linkSessions ? <SessionLink id={r.sessionId}>{r.title}</SessionLink> : <span className="font-medium">{r.title}</span>}
                        <span className="block text-xs text-muted-foreground">
                          {t(`attendance.kinds.${r.kind}`)}
                          {r.department !== undefined &&
                            ` · ${r.department ? deptName(r.department) : t('attendance.member.office')}`}
                        </span>
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
