import { SlidersHorizontal, TrendingDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { MemberLink } from './member-link'
import { memberFullName } from '@/features/members/utils'
import { useLowAttendance } from '../api'
import { PeriodFilter, type PeriodPreset, presetRange } from './period-filter'
import { formatDuration, sessionDate } from '../time'
import { SESSION_KINDS, type SessionKind } from '../types'

const ALL = '__all__'

/** Members below a rate threshold over closed sessions in a period, for follow-up. */
export function LowAttendanceReport() {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<PeriodPreset>('quarter')
  const [range, setRange] = useState(() => presetRange('quarter'))
  const [threshold, setThreshold] = useState(50)
  const [minSessions, setMinSessions] = useState(3)
  const [kind, setKind] = useState<SessionKind | undefined>()
  const { data, isPending, isError, error, refetch } = useLowAttendance({
    from: range.from || undefined,
    to: range.to || undefined,
    threshold,
    minSessions,
    kind,
  })

  const numberInput = (value: number, set: (n: number) => void, max: number) => (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (n >= 1 && n <= max) set(n)
      }}
      className="w-24"
    />
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <header className="mb-3 flex items-start gap-2.5 border-b border-dashed pb-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive" aria-hidden>
            <TrendingDown className="size-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t('attendance.tabs.report')}</h2>
            <p className="text-xs text-muted-foreground">{t('attendance.report.description')}</p>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            preset={preset}
            range={range}
            onPreset={setPreset}
            onRange={setRange}
            presets={['month', 'quarter', 'year', 'custom']}
          />
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
          {/* The report's two thresholds live in one quiet popover instead of two labelled inputs. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal />
                <span className="tabular">
                  {threshold}% · {minSessions}+
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 space-y-3">
              <Field>
                <FieldLabel>{t('attendance.report.threshold')}</FieldLabel>
                {numberInput(threshold, setThreshold, 100)}
              </Field>
              <Field>
                <FieldLabel>{t('attendance.report.minSessions')}</FieldLabel>
                {numberInput(minSessions, setMinSessions, 100)}
              </Field>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.members.length === 0 ? (
          <EmptyState icon={TrendingDown} title={t('attendance.report.empty', { threshold })} />
        ) : (
          <>
            <p className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
              <span className="tabular grid size-6 place-items-center rounded-full bg-destructive/10 font-record text-xs font-bold text-destructive">
                {data.members.length}
              </span>
              {t('attendance.report.count', { count: data.members.length })}
            </p>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t('departments.roster.member')}</TableHead>
                  <TableHead className="text-right">{t('attendance.member.rate')}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t('attendance.statuses.PRESENT')}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t('attendance.statuses.LATE')}</TableHead>
                  <TableHead className="text-right">{t('attendance.statuses.ABSENT')}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t('attendance.statuses.EXCUSED')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('attendance.member.timeAttended')}</TableHead>
                  <TableHead className="pr-4">{t('attendance.report.lastAttended')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((r) => (
                  <TableRow key={r.member.id}>
                    <TableCell className="pl-4">
                      <MemberLink memberId={r.member.id} className="flex items-center gap-3">
                        <MemberAvatar member={r.member} />
                        <span>
                          <span className="block font-medium">{memberFullName(r.member)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.member.memberCode}
                            {r.member.phone && ` · ${r.member.phone}`}
                          </span>
                        </span>
                      </MemberLink>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-1 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-destructive"
                            style={{ width: `${Math.max(r.rate, 2)}%` }}
                          />
                        </span>
                        <span className="tabular w-10 font-semibold text-destructive">{r.rate}%</span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{r.present}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{r.late}</TableCell>
                    <TableCell className="tabular text-right">{r.absent}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{r.excused}</TableCell>
                    <TableCell className="tabular hidden lg:table-cell">{formatDuration(r.minutesAttended, t)}</TableCell>
                    <TableCell className="tabular pr-4 whitespace-nowrap text-muted-foreground">
                      {r.lastAttended ? sessionDate(r.lastAttended) : t('attendance.report.never')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>
    </div>
  )
}
