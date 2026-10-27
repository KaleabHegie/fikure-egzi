import { useQuery } from '@tanstack/react-query'
import { Medal, Printer, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { ecMonthBounds, ecToday, todayIso } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { attendanceApi, attendanceKeys, useSessions } from '../api'
import { useAudienceLabel } from '../audience'
import { formatDuration, sessionDate, sessionTimes } from '../time'
import { SESSION_KINDS, type SessionKind } from '../types'
import { MemberLink } from './member-link'

const ALL = '__all__'
const MEDALS = ['text-[#D0A35C]', 'text-neutral-400', 'text-[#a26a42]'] // gold, silver, bronze

/**
 * Top attendance: pick the sessions (events) to count, then see who came
 * most — ranked by sessions attended, then rate, then time attended.
 */
export function TopAttendanceReport() {
  const { t } = useTranslation()
  const audience = useAudienceLabel()
  const thisMonth = ecMonthBounds(ecToday().year, ecToday().month)
  const [from, setFrom] = useState(thisMonth.start)
  const [to, setTo] = useState(todayIso())
  const [kind, setKind] = useState<SessionKind | undefined>()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [shown, setShown] = useState<number[] | null>(null)

  const sessions = useSessions({ page: 1, pageSize: 100, from: from || undefined, to: to || undefined, kind })
  const list = sessions.data?.data ?? []
  const allSelected = list.length > 0 && list.every((s) => selected.has(s.id))
  const report = useQuery({
    queryKey: [...attendanceKeys.all, 'top', shown],
    queryFn: () => attendanceApi.topAttendance(shown!),
    enabled: Boolean(shown?.length),
  })

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 print:hidden">
        <h2 className="mb-1 font-medium">{t('attendance.top.chooseTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('attendance.top.chooseBody')}</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <EthDatePicker value={from} onChange={setFrom} clearable placeholder={t('attendance.filters.from')} className="w-40" />
          <EthDatePicker value={to} onChange={setTo} clearable placeholder={t('attendance.filters.to')} className="w-40" />
          <Select value={kind ?? ALL} onValueChange={(v) => setKind(v === ALL ? undefined : (v as SessionKind))}>
            <SelectTrigger className="w-44" aria-label={t('attendance.fields.kind')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('attendance.filters.allKinds')}</SelectItem>
              {SESSION_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`attendance.kinds.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sessions.isPending ? (
          <Skeleton className="h-40" />
        ) : list.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('attendance.top.noSessions')}
          </p>
        ) : (
          <div className="rounded-lg border">
            <label className="flex items-center gap-3 border-b px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={allSelected}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    for (const s of list) {
                      if (allSelected) next.delete(s.id)
                      else next.add(s.id)
                    }
                    return next
                  })
                }
              />
              {t('attendance.top.selectAll', { count: list.length })}
            </label>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {list.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sessionDate(s.startsAt)} · {sessionTimes(s.startsAt, s.endsAt)} · {audience(s)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {t(`attendance.kinds.${s.kind}`)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">{t('attendance.top.selected', { count: selected.size })}</span>
          <Button onClick={() => setShown([...selected])} disabled={selected.size === 0}>
            <Trophy />
            {t('attendance.top.show')}
          </Button>
        </div>
      </section>

      {shown &&
        (report.isError ? (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        ) : report.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : report.data.members.length === 0 ? (
          <EmptyState icon={Trophy} title={t('attendance.top.empty')} className="rounded-xl border bg-card" />
        ) : (
          <section className="rounded-xl border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 font-medium">
                  <Trophy className="size-4 text-[#D0A35C]" />
                  {t('attendance.top.title')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('attendance.top.summary', {
                    sessions: report.data.totalSessions,
                    attendees: report.data.attendees,
                  })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
                <Printer />
                {t('attendance.top.print')}
              </Button>
            </header>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14 pl-4">#</TableHead>
                    <TableHead>{t('attendance.top.member')}</TableHead>
                    <TableHead className="text-right">{t('attendance.top.attended')}</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">{t('attendance.statuses.LATE')}</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">{t('attendance.statuses.ABSENT')}</TableHead>
                    <TableHead className="text-right">{t('attendance.member.rate')}</TableHead>
                    <TableHead className="hidden pr-4 text-right md:table-cell">{t('attendance.member.timeAttended')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.members.map((r) => (
                    <TableRow key={r.member.id} className={cn(r.rank <= 3 && 'bg-accent/30')}>
                      <TableCell className="pl-4">
                        {r.rank <= 3 ? (
                          <span className="flex items-center gap-1 font-semibold">
                            <Medal className={cn('size-4', MEDALS[r.rank - 1])} />
                            {r.rank}
                          </span>
                        ) : (
                          <span className="tabular text-muted-foreground">{r.rank}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <MemberLink memberId={r.member.id} className="flex items-center gap-3">
                          <MemberAvatar member={r.member} />
                          <span>
                            <span className="block font-medium">{memberFullName(r.member)}</span>
                            <span className="block font-mono text-xs text-muted-foreground">{r.member.memberCode}</span>
                          </span>
                        </MemberLink>
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {r.attended} / {report.data.totalSessions}
                      </TableCell>
                      <TableCell className="tabular hidden text-right sm:table-cell">{r.late}</TableCell>
                      <TableCell className="tabular hidden text-right sm:table-cell">{r.absent}</TableCell>
                      <TableCell className="tabular text-right">{r.rate === null ? '—' : `${r.rate}%`}</TableCell>
                      <TableCell className="tabular hidden pr-4 text-right md:table-cell">
                        {formatDuration(r.minutesAttended, t)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))}
    </div>
  )
}
