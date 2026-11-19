import { CalendarCheck, CalendarDays, CalendarRange, ChevronRight, Clock, FileSpreadsheet, ListFilter, Plus, Search, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { FilterChip } from '@/components/common/filter-chip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { attendanceApi, useAttendanceMutation, useSessions } from '../api'
import { useAudienceLabel } from '../audience'
import { AttendanceImportDialog } from '../components/attendance-import-dialog'
import { DayStrip } from '../components/day-strip'
import { SessionDialog } from '../components/session-dialog'
import { ecMonthName, formatEth, gcToEc } from '@/lib/ethiopian-calendar'
import { STATUS_STYLES } from '../status-styles'
import { addisDate, addisToday, sessionDate, sessionTimes, shiftDay, SIDE_DAYS } from '../time'
import { formatDate } from '@/lib/format'
import { ATTENDANCE_STATUSES, type AttendanceSession, SESSION_KINDS, type SessionKind, type SessionStatus } from '../types'

const ALL = '__all__'

/** Thin stacked bar of the session's marks, one segment per status. */
function CountsBar({ s }: { s: AttendanceSession }) {
  const total = Math.max(s.rosterSize, 1)
  return (
    <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-muted" aria-hidden>
      {ATTENDANCE_STATUSES.map((st) => {
        const n = s.counts[st.toLowerCase() as keyof typeof s.counts]
        return n > 0 ? (
          <span key={st} className={cn('h-full', STATUS_STYLES[st].split(' ')[0])} style={{ width: `${(n / total) * 100}%` }} />
        ) : null
      })}
    </div>
  )
}

function SessionRow({ s }: { s: AttendanceSession }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'am' ? 'am' : 'en'
  const audience = useAudienceLabel()
  // The session's Addis-local Ethiopian date, for the calendar tile.
  const ec = gcToEc(addisDate(s.startsAt))
  return (
    <li>
      <Link to={`/attendance/${s.id}`} className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
        {ec && (
          <div
            className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-accent text-accent-foreground"
            title={sessionDate(s.startsAt)}
          >
            <span className="tabular font-record text-lg leading-none font-semibold">{ec.day}</span>
            <span className="max-w-11 truncate text-[10px] leading-tight">{ecMonthName(ec.month, lang)}</span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium group-hover:underline">{s.title}</span>
            <span className="rounded-full border px-2 text-[11px] text-muted-foreground">{t(`attendance.kinds.${s.kind}`)}</span>
            {s.status === 'OPEN' && (
              <span className="rounded-full bg-success/12 px-2 text-[11px] font-medium text-success">
                {t('attendance.sessionStatus.OPEN')}
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="tabular flex items-center gap-1">
              <Clock className="size-3 shrink-0" />
              {sessionTimes(s.startsAt, s.endsAt)}
            </span>
            {ec && <span className="tabular">{formatEth(new Date(s.startsAt), 'year', lang)}</span>}
            <span className="flex min-w-0 items-center gap-1">
              <Users className="size-3 shrink-0" />
              <span className="truncate">
                {audience(s)} · {t('attendance.expected', { count: s.rosterSize })}
              </span>
            </span>
          </p>
          <CountsBar s={s} />
        </div>
        <div className="hidden w-32 shrink-0 text-right sm:block">
          {/* Turnout against the expected roster — not the rate among the few already marked. */}
          <p className="tabular font-record text-base font-semibold">
            {s.rosterSize > 0
              ? t('attendance.ratePresent', {
                  rate: Math.round(((s.counts.present + s.counts.late) / s.rosterSize) * 100),
                })
              : '—'}
          </p>
          {s.unmarked > 0 && <p className="text-xs text-muted-foreground">{t('attendance.unmarked', { count: s.unmarked })}</p>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

const SEARCH_DEBOUNCE_MS = 300

function SessionsList() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [kind, setKind] = useState<SessionKind | undefined>()
  const [status, setStatus] = useState<SessionStatus | undefined>()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  // The day shown (today unless chosen) lives in the URL, so coming back from a session keeps it.
  const [params, setParams] = useSearchParams()
  const raw = params.get('day')
  const allDays = raw === 'all'
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : addisToday()
  const showDay = (next: string | 'all') => {
    setParams(next === addisToday() ? {} : { day: next }, { replace: true })
    setPage(1)
  }
  const filters = { kind, status, search: query.trim() || undefined }
  const { data, isPending, isError, error, refetch } = useSessions({
    page,
    pageSize,
    ...filters,
    ...(!allDays && { from: day, to: day }),
  })
  // How many sessions each day of the strip has (same filters), for its dots.
  const strip = useSessions({
    page: 1,
    pageSize: 100,
    ...filters,
    from: shiftDay(day, -SIDE_DAYS),
    to: shiftDay(day, SIDE_DAYS),
  })
  const counts: Record<string, number> = {}
  if (!allDays) for (const s of strip.data?.data ?? []) counts[addisDate(s.startsAt)] = (counts[addisDate(s.startsAt)] ?? 0) + 1

  const onSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setQuery(value)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {/* Search fills the row; the filters sit at its right end. */}
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('attendance.searchPlaceholder')}
            aria-label={t('attendance.searchPlaceholder')}
          />
        </div>
        {kind && (
          <FilterChip
            category={t('attendance.fields.kind')}
            value={t(`attendance.kinds.${kind}`)}
            onClear={() => {
              setKind(undefined)
              setPage(1)
            }}
          />
        )}
        {status && (
          <FilterChip
            category={t('members.table.status')}
            value={t(`attendance.sessionStatus.${status}`)}
            onClear={() => {
              setStatus(undefined)
              setPage(1)
            }}
          />
        )}
        <Button variant="outline" onClick={() => showDay(allDays ? addisToday() : 'all')}>
          {allDays ? <CalendarDays /> : <CalendarRange />}
          {allDays ? t('attendance.days.byDay') : t('attendance.days.all')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ListFilter />
              {t('common.filter')}
              {(kind ? 1 : 0) + (status ? 1 : 0) > 0 && (
                <span className="tabular grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {(kind ? 1 : 0) + (status ? 1 : 0)}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('attendance.fields.kind')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={kind ?? ALL}
                  onValueChange={(v) => {
                    setKind(v === ALL ? undefined : (v as SessionKind))
                    setPage(1)
                  }}
                >
                  <DropdownMenuRadioItem value={ALL}>{t('attendance.filters.allKinds')}</DropdownMenuRadioItem>
                  {SESSION_KINDS.map((k) => (
                    <DropdownMenuRadioItem key={k} value={k}>
                      {t(`attendance.kinds.${k}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('members.table.status')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={status ?? ALL}
                  onValueChange={(v) => {
                    setStatus(v === ALL ? undefined : (v as SessionStatus))
                    setPage(1)
                  }}
                >
                  <DropdownMenuRadioItem value={ALL}>{t('attendance.filters.allStatuses')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="OPEN">{t('attendance.sessionStatus.OPEN')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="CLOSED">{t('attendance.sessionStatus.CLOSED')}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!allDays && <DayStrip day={day} onDay={showDay} counts={counts} />}
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : data.data.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={
            !allDays
              ? t('attendance.days.none', { date: formatDate(`${day}T00:00:00.000Z`) })
              : kind || status || query
                ? t('attendance.noMatch')
                : t('attendance.noSessions')
          }
          description={
            !allDays ? t('attendance.days.noneHint') : kind || status || query ? undefined : t('attendance.noSessionsBody')
          }
        />
      ) : (
        <>
          <ul className="divide-y">
            {data.data.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </ul>
          <div className="border-t px-3">
            <PaginationBar
              meta={data.meta}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </div>
        </>
      )}
    </section>
  )
}

export function AttendancePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { can } = useAuth()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const create = useAttendanceMutation(attendanceApi.create)

  return (
    <>
      <PageHeader
        title={t('attendance.title')}
        description={t('attendance.description')}
        actions={
          <>
            {/* Importing past records creates sessions on other days, so it's for admins. */}
            {can(PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ATTENDANCE_ANY_DAY, PERMISSIONS.MEMBERS_READ) && (
              <Button size="lg" variant="outline" onClick={() => setImporting(true)}>
                <FileSpreadsheet />
                {t('attendance.import.button')}
              </Button>
            )}
            {can(PERMISSIONS.ATTENDANCE_MANAGE) && (
              <Button size="lg" onClick={() => setCreating(true)}>
                <Plus />
                {t('attendance.newSession')}
              </Button>
            )}
          </>
        }
      />
      <SessionsList />

      {/* Mounted only while open, so every new session starts from the defaults. */}
      {creating && (
        <SessionDialog
          open
          onOpenChange={setCreating}
          onSave={async (input) => {
            const session = await create.mutateAsync(input)
            toast.success(t('attendance.created'))
            navigate(`/attendance/${session.id}`)
          }}
        />
      )}
      <AttendanceImportDialog open={importing} onOpenChange={setImporting} />
    </>
  )
}
