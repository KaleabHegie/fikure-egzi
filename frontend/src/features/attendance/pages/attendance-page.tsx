import { CalendarCheck, ChevronRight, Clock, FileSpreadsheet, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/use-auth'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { attendanceApi, useAttendanceMutation, useSessions } from '../api'
import { useAudienceLabel } from '../audience'
import { AttendanceImportDialog } from '../components/attendance-import-dialog'
import { LowAttendanceReport } from '../components/low-attendance-report'
import { TopAttendanceReport } from '../components/top-attendance-report'
import { SessionDialog } from '../components/session-dialog'
import { STATUS_STYLES } from '../status-styles'
import { sessionDate, sessionTimes } from '../time'
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
  const { t } = useTranslation()
  const audience = useAudienceLabel()
  return (
    <li>
      <Link to={`/attendance/${s.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
        <div className="w-28 shrink-0">
          <p className="text-sm font-medium">{sessionDate(s.startsAt)}</p>
          <p className="tabular flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {sessionTimes(s.startsAt, s.endsAt)}
          </p>
        </div>
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
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Users className="size-3 shrink-0" />
            {audience(s)} · {t('attendance.expected', { count: s.rosterSize })}
          </p>
          <CountsBar s={s} />
        </div>
        <div className="hidden w-32 shrink-0 text-right sm:block">
          <p className="tabular text-sm font-semibold">{s.rate === null ? '—' : t('attendance.ratePresent', { rate: s.rate })}</p>
          {s.unmarked > 0 && <p className="text-xs text-muted-foreground">{t('attendance.unmarked', { count: s.unmarked })}</p>}
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </li>
  )
}

function SessionsList() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [kind, setKind] = useState<SessionKind | undefined>()
  const [status, setStatus] = useState<SessionStatus | undefined>()
  const { data, isPending, isError, error, refetch } = useSessions({ page, pageSize, kind, status })

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap gap-2 border-b p-3">
        <Select
          value={kind ?? ALL}
          onValueChange={(v) => {
            setKind(v === ALL ? undefined : (v as SessionKind))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48" aria-label={t('attendance.fields.kind')}>
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
        <Select
          value={status ?? ALL}
          onValueChange={(v) => {
            setStatus(v === ALL ? undefined : (v as SessionStatus))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-44" aria-label={t('attendance.sessionStatus.OPEN')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('attendance.filters.allStatuses')}</SelectItem>
            <SelectItem value="OPEN">{t('attendance.sessionStatus.OPEN')}</SelectItem>
            <SelectItem value="CLOSED">{t('attendance.sessionStatus.CLOSED')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
          title={kind || status ? t('attendance.noMatch') : t('attendance.noSessions')}
          description={kind || status ? undefined : t('attendance.noSessionsBody')}
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
  const [params, setParams] = useSearchParams()
  // The report lists members, so attendance takers (scanners) don't get it.
  const requested = params.get('tab')
  const tab = (requested === 'report' || requested === 'top') && can(PERMISSIONS.MEMBERS_READ) ? requested : 'sessions'
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
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'sessions' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="sessions">{t('attendance.tabs.sessions')}</TabsTrigger>
          {can(PERMISSIONS.MEMBERS_READ) && <TabsTrigger value="top">{t('attendance.tabs.top')}</TabsTrigger>}
          {can(PERMISSIONS.MEMBERS_READ) && <TabsTrigger value="report">{t('attendance.tabs.report')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="sessions">
          <SessionsList />
        </TabsContent>
        <TabsContent value="top">
          <TopAttendanceReport />
        </TabsContent>
        <TabsContent value="report">
          <LowAttendanceReport />
        </TabsContent>
      </Tabs>

      <SessionDialog
        open={creating}
        onOpenChange={setCreating}
        onSave={async (input) => {
          const session = await create.mutateAsync(input)
          toast.success(t('attendance.created'))
          navigate(`/attendance/${session.id}`)
        }}
      />
      <AttendanceImportDialog open={importing} onOpenChange={setImporting} />
    </>
  )
}
