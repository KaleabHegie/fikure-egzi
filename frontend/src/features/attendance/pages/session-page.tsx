import { useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Clock,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  MapPin,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Shirt,
  Trash2,
  Undo2,
  Users,
  FileSpreadsheet,
  ChevronLeft,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { MemberLink } from '../components/member-link'
import { SessionSheetDialog } from '../components/session-sheet-dialog'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage, toApiError } from '@/lib/api/errors'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { attendanceApi, attendanceKeys, useAttendanceMutation, useRoster, useSession } from '../api'
import { useAudienceLabel } from '../audience'
import { Scanner } from '../components/scanner'
import { beep } from '../feedback'
import { SessionDialog } from '../components/session-dialog'
import { AttendanceStatusBadge } from '../components/status-badge'
import { STATUS_STYLES } from '../status-styles'
import { formatTime } from '@/lib/format'
import { addisDate, addisEthTime, sessionDate, sessionTimes } from '../time'
import { ATTENDANCE_STATUSES, type AttendanceStatus, type RosterRow, type ScanResult, type VestmentState } from '../types'

type Filter = 'ALL' | 'UNMARKED' | 'VESTMENT_OUT' | AttendanceStatus
const PAGE = 150

interface Feed {
  key: number
  result?: ScanResult
  error?: string
}

function Stat({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-1.5 sm:px-3 sm:py-2">
      <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p>
      <p className={cn('tabular font-record text-base font-semibold sm:text-xl', className)}>{value}</p>
    </div>
  )
}

export function SessionPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()
  const canTake = can(PERMISSIONS.ATTENDANCE_TAKE)
  const canManage = can(PERMISSIONS.ATTENDANCE_MANAGE)
  const audienceLabel = useAudienceLabel()
  const session = useSession(id)
  // The roster and its totals are member information: attendance takers (scanners) only scan.
  const showRoster = can(PERMISSIONS.MEMBERS_READ)
  const roster = useRoster(id, showRoster)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [limit, setLimit] = useState(PAGE)
  const [feed, setFeed] = useState<Feed[]>([])
  const [today] = useState(() => addisDate(new Date().toISOString()))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [dialog, setDialog] = useState<'edit' | 'close' | 'delete' | null>(null)
  // The scanner can fill the screen (a phone or tablet at the door); the browser's own
  // full screen hides its bars where it is allowed, otherwise the panel just covers the page.
  const [fullscreen, setFullscreen] = useState(false)
  const enterFullscreen = () => {
    setFullscreen(true)
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
  }
  const exitFullscreen = () => {
    setFullscreen(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }
  useEffect(() => {
    if (!fullscreen) return
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [fullscreen])

  /** Patch one roster row in the cache instead of refetching a possibly 2,000-row list. */
  const patchRoster = (memberId: number, patch: (row: RosterRow | undefined) => RosterRow | undefined) => {
    qc.setQueryData<RosterRow[]>(attendanceKeys.roster(id), (rows) => {
      if (!rows) return rows
      const i = rows.findIndex((r) => r.member.id === memberId)
      const next = patch(rows[i])
      if (i === -1) return next ? [...rows, next] : rows
      const copy = [...rows]
      if (next) copy[i] = next
      else copy.splice(i, 1)
      return copy
    })
    void qc.invalidateQueries({ queryKey: attendanceKeys.session(id) })
  }

  const onCode = async (code: string) => {
    setScanning(true)
    try {
      const result = await attendanceApi.scan(id, code)
      // Someone outside the class is only reported; nothing is recorded.
      beep(result.inRoster && !result.alreadyRecorded && result.record?.status !== 'ABSENT')
      setFeed((f) => [{ key: Date.now(), result }, ...f].slice(0, 12))
      const record = result.record
      if (result.inRoster && record) {
        patchRoster(result.member.id, (row) => ({
          member: result.member,
          inRoster: row?.inRoster ?? true,
          record,
          permission: row?.permission ?? null,
        }))
      }
    } catch (e) {
      beep(false)
      const err = toApiError(e)
      const message = err.status === 404 ? t('attendance.scan.unknown', { code }) : getErrorMessage(e)
      setFeed((f) => [{ key: Date.now(), error: message }, ...f].slice(0, 12))
    } finally {
      setScanning(false)
    }
  }

  const mark = async (row: RosterRow, status: AttendanceStatus | null, note?: string | null) => {
    try {
      if (status === null) {
        await attendanceApi.unmark(id, row.member.id)
        patchRoster(row.member.id, (r) => (r && r.inRoster ? { ...r, record: null } : undefined))
      } else {
        const record = await attendanceApi.mark(id, row.member.id, status, note)
        patchRoster(row.member.id, (r) => (r ? { ...r, record } : r))
      }
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  /** ልብሰ ስብሐት: took, returned, or undone. Works on closed sessions too (returns come later). */
  const setVestment = async (row: RosterRow, state: VestmentState) => {
    try {
      const record = await attendanceApi.vestment(id, row.member.id, state)
      patchRoster(row.member.id, (r) => (r ? { ...r, record } : r))
      // Keep the recent-scans list in step with the roster.
      setFeed((items) =>
        items.map((f) =>
          f.result?.member.id === row.member.id ? { ...f, result: { ...f.result, record } } : f,
        ),
      )
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const update = useAttendanceMutation((input: Parameters<typeof attendanceApi.update>[1]) => attendanceApi.update(id, input))
  const close = useAttendanceMutation(() => attendanceApi.close(id))
  const reopen = useAttendanceMutation(() => attendanceApi.reopen(id))
  const remove = useAttendanceMutation(() => attendanceApi.remove(id))

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (roster.data ?? []).filter((r) => {
      if (filter === 'UNMARKED' && r.record) return false
      if (filter === 'VESTMENT_OUT' && !(r.record?.vestmentTakenAt && !r.record.vestmentReturnedAt)) return false
      if (filter !== 'ALL' && filter !== 'UNMARKED' && filter !== 'VESTMENT_OUT' && r.record?.status !== filter) return false
      if (!q) return true
      return `${memberFullName(r.member)} ${r.member.christianName ?? ''} ${r.member.memberCode}`.toLowerCase().includes(q)
    })
  }, [roster.data, search, filter])

  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />
  if (session.isPending) return <Skeleton className="h-96 rounded-xl" />

  const s = session.data
  const open = s.status === 'OPEN'
  // Attendance takers may only change today's sessions; other days are for department admins.
  const dayOk = can(PERMISSIONS.ATTENDANCE_ANY_DAY) || addisDate(s.startsAt) === today
  const editable = open && canTake && dayOk
  const marked = s.counts.present + s.counts.late + s.counts.absent + s.counts.excused
  // Gatherings and events only record who came.
  const statuses = s.kind === 'OTHER' ? (['PRESENT'] as const) : ATTENDANCE_STATUSES

  return (
    <>
      {/* Compact header: on phones the scanner should be on screen, not pushed down. */}
      <header className="mb-4 sm:mb-6">
        <Link
          to="/attendance"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:mb-2 sm:text-sm"
        >
          <ChevronLeft className="size-4" />
          {t('attendance.title')}
        </Link>
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 font-record text-lg leading-tight font-semibold sm:text-2xl">{s.title}</h1>
          {canManage && dayOk && (
            <div className="flex shrink-0 items-center gap-1.5">
              {open ? (
                <Button size="sm" onClick={() => setDialog('close')} aria-label={t('attendance.close')}>
                  <Lock />
                  <span className="hidden sm:inline">{t('attendance.close')}</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('attendance.reopen')}
                  onClick={() =>
                    reopen.mutate(undefined, {
                      onSuccess: () => toast.success(t('attendance.reopened')),
                      onError: (e) => toast.error(getErrorMessage(e)),
                    })
                  }
                >
                  <LockOpen />
                  <span className="hidden sm:inline">{t('attendance.reopen')}</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="outline" aria-label={t('attendance.editSession')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog('edit')}>
                    <Pencil />
                    {t('common.edit')}
                  </DropdownMenuItem>
                  {can(PERMISSIONS.ATTENDANCE_DELETE) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                        <Trash2 />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
            {t(`attendance.kinds.${s.kind}`)}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              open ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
            )}
          >
            {t(`attendance.sessionStatus.${s.status}`)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5 shrink-0" />
            {sessionDate(s.startsAt)}
          </span>
          <span className="tabular flex items-center gap-1">
            <Clock className="size-3.5 shrink-0" />
            {sessionTimes(s.startsAt, s.endsAt)}
          </span>
          {audienceLabel(s) !== s.title && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5 shrink-0" />
              {audienceLabel(s)}
            </span>
          )}
          {s.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              {s.location}
            </span>
          )}
          {s.kind !== 'OTHER' && <span>· {t('attendance.thresholds.late', { minutes: s.lateAfterMinutes })}</span>}
          {s.kind !== 'OTHER' && s.absentAfterMinutes !== null && (
            <span>· {t('attendance.thresholds.absent', { minutes: s.absentAfterMinutes })}</span>
          )}
          {open && s.closesAt && <span>· {t('attendance.autoCloses', { time: addisEthTime(s.closesAt) })}</span>}
        </p>
      </header>

      {/* Totals are for those who see the roster; scanners just scan. */}
      {showRoster && (
        <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2 lg:grid-cols-7">
          <Stat label={t('attendance.audience')} value={s.rosterSize} />
          {ATTENDANCE_STATUSES.map((st) => (
            <Stat
              key={st}
              label={t(`attendance.statuses.${st}`)}
              value={s.counts[st.toLowerCase() as keyof typeof s.counts]}
              className={STATUS_STYLES[st].split(' ').find((c) => c.startsWith('text-'))}
            />
          ))}
          <Stat label={t('attendance.roster.unmarked')} value={s.unmarked} />
          {/* Turnout against the expected roster — not the rate among the few already marked. */}
          <Stat
            label={t('attendance.member.rate')}
            value={
              s.rosterSize > 0
                ? `${Math.round(((s.counts.present + s.counts.late) / s.rosterSize) * 100)}%`
                : '—'
            }
          />
        </div>
      )}

      {showRoster && s.vestmentCounts && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
          <Shirt className="size-4 shrink-0 text-gilt-ink" aria-hidden />
          <span className="font-medium">{t('attendance.vestments.label')}፦</span>
          <span className="tabular">
            {t('attendance.vestments.summary', { taken: s.vestmentCounts.taken, out: s.vestmentCounts.out })}
          </span>
        </p>
      )}

      {(!open || !dayOk) && (
        <p className="mb-4 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4" />
          {dayOk ? t('attendance.closedNotice') : t('attendance.otherDayNotice')}
        </p>
      )}

      <div className={cn('grid gap-4', editable && showRoster && 'lg:grid-cols-[minmax(0,26rem)_1fr]')}>
        {editable && (
          <section
            className={cn(
              'space-y-4',
              fullscreen
                ? 'fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-8'
                : 'rounded-xl border bg-card p-4 lg:sticky lg:top-20 lg:self-start',
            )}
            aria-label={t('attendance.scan.title')}
            // Android's back button leaves full screen (it sends Escape to what is open).
            data-back-closes={fullscreen || undefined}
          >
            <div className={cn('space-y-4', fullscreen && 'mx-auto max-w-2xl')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className={cn('font-semibold', fullscreen && 'text-xl')}>{t('attendance.scan.title')}</h2>
                {/* In full screen the rest of the page is hidden: say which session and how it stands. */}
                {fullscreen && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{s.title}</span>
                    {' · '}
                    {t('attendance.statuses.PRESENT')} {s.counts.present} · {t('attendance.statuses.LATE')} {s.counts.late}
                    {s.vestmentCounts && ` · ${t('attendance.vestments.label')} ${t('attendance.vestments.summary', { taken: s.vestmentCounts.taken, out: s.vestmentCounts.out })}`}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={fullscreen ? exitFullscreen : enterFullscreen}
                aria-pressed={fullscreen}
              >
                {fullscreen ? <Minimize2 /> : <Maximize2 />}
                {fullscreen ? t('attendance.scan.exitFullscreen') : t('attendance.scan.fullscreen')}
              </Button>
            </div>
            <Scanner onCode={(c) => void onCode(c)} busy={scanning} />
            {feed.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('attendance.scan.recent')}
                </h3>
                <ul className="space-y-1.5" aria-live="polite">
                  {feed.map((f) =>
                    f.error ? (
                      <li key={f.key} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {f.error}
                      </li>
                    ) : f.result!.record ? (
                      <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted/50 px-3 py-2">
                        <MemberAvatar member={f.result!.member} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{memberFullName(f.result!.member)}</p>
                          <p className="text-xs text-muted-foreground">
                            {f.result!.member.memberCode}
                            {f.result!.alreadyRecorded && ` · ${t('attendance.scan.already')}`}
                          </p>
                        </div>
                        <AttendanceStatusBadge status={f.result!.record.status} />
                        {s.vestments && showRoster && (
                          <VestmentControl
                            // The roster holds the latest state; the scan result is the fallback.
                            record={
                              roster.data?.find((r) => r.member.id === f.result!.member.id)?.record ?? f.result!.record
                            }
                            canChange={canTake}
                            onChange={(state) =>
                              setVestment(
                                { member: f.result!.member, inRoster: true, record: f.result!.record, permission: null },
                                state,
                              )
                            }
                            name={memberFullName(f.result!.member)}
                            compact
                          />
                        )}
                      </li>
                    ) : (
                      // Not in this session's class or group: just say so.
                      <li
                        key={f.key}
                        className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2"
                      >
                        <MemberAvatar member={f.result!.member} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{memberFullName(f.result!.member)}</p>
                          <p className="text-xs font-medium text-[oklch(0.45_0.1_70)] dark:text-warning">
                            {t('attendance.scan.notInRoster')}
                          </p>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
            </div>
          </section>
        )}

        {showRoster && (
          <section className="rounded-xl border bg-card">
            <header className="space-y-3 border-b p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{t('attendance.roster.title')}</h2>
                <span className="flex items-center gap-2">
                  <span className="tabular text-xs text-muted-foreground">
                    {marked}/{s.rosterSize}
                  </span>
                  {editable && (
                    <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                      <FileSpreadsheet />
                      {t('attendance.import.sheetButton')}
                    </Button>
                  )}
                </span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="pl-8"
                  placeholder={t('attendance.roster.search')}
                  aria-label={t('attendance.roster.search')}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setLimit(PAGE)
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group">
                {(['ALL', 'UNMARKED', ...statuses, ...(s.vestments ? ['VESTMENT_OUT'] : [])] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => {
                      setFilter(f)
                      setLimit(PAGE)
                    }}
                    className={cn(
                      'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                      filter === f ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    {f === 'ALL'
                      ? t('attendance.roster.all')
                      : f === 'UNMARKED'
                        ? t('attendance.roster.unmarked')
                        : f === 'VESTMENT_OUT'
                          ? t('attendance.vestments.outFilter', { count: s.vestmentCounts?.out ?? 0 })
                          : t(`attendance.statuses.${f}`)}
                  </button>
                ))}
              </div>
            </header>

            {roster.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('attendance.roster.empty')}</p>
            ) : (
              <ul className="divide-y">
                {rows.slice(0, limit).map((r) => (
                  <RosterItem
                    statuses={statuses}
                    key={r.member.id}
                    row={r}
                    editable={editable}
                    onMark={mark}
                    vestments={s.vestments}
                    canVestment={canTake}
                    onVestment={setVestment}
                  />
                ))}
              </ul>
            )}
            {rows.length > limit && (
              <div className="border-t p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE * 4)}>
                  {t('common.view')} +{Math.min(rows.length - limit, PAGE * 4)}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      {dialog === 'edit' && (
        <SessionDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          session={s}
          onSave={async ({ kind: _kind, ...input }) => {
            await update.mutateAsync(input)
            toast.success(t('attendance.saved'))
          }}
        />
      )}
      <ConfirmDialog
        open={dialog === 'close'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('attendance.closeTitle')}
        description={t('attendance.closeBody', { count: s.unmarked })}
        confirmLabel={t('attendance.close')}
        pending={close.isPending}
        onConfirm={() =>
          close.mutate(undefined, {
            onSuccess: () => {
              toast.success(t('attendance.closed'))
              setDialog(null)
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
      <SessionSheetDialog sessionId={s.id} open={sheetOpen} onOpenChange={setSheetOpen} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('attendance.deleteTitle')}
        description={t('attendance.deleteBody', { count: marked })}
        confirmLabel={t('common.delete')}
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success(t('attendance.deleted'))
              navigate('/attendance', { replace: true })
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </>
  )
}

/** One roster line: who, their mark, and (while open) one-tap status buttons. */
/**
 * ልብሰ ስብሐት on a roster row: "took" once they are present or late, then
 * "returned"; undo steps back. Shown even on closed sessions so a return can be
 * noted later.
 */
function VestmentControl({
  record,
  canChange,
  onChange,
  name,
  compact = false,
}: {
  record: RosterRow['record']
  canChange: boolean
  onChange: (state: VestmentState) => Promise<void>
  name: string
  /** In the narrow recent-scans list: icon-only "took" button. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const run = (state: VestmentState) => {
    setBusy(true)
    void onChange(state).finally(() => setBusy(false))
  }
  const taken = record?.vestmentTakenAt
  const returned = record?.vestmentReturnedAt
  const attended = record?.status === 'PRESENT' || record?.status === 'LATE'
  if (!taken) {
    if (!canChange || !attended) return null
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={busy}
        onClick={() => run('TAKEN')}
        title={t('attendance.vestments.take')}
        aria-label={`${t('attendance.vestments.take')} · ${name}`}
      >
        <Shirt />
        {!compact && t('attendance.vestments.take')}
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`${t('attendance.vestments.label')} · ${name}`}>
      <span
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold',
          returned ? 'bg-success/12 text-success' : 'bg-gold/20 text-gilt-ink',
        )}
        title={`${t('attendance.vestments.taken')} ${addisEthTime(taken)}${returned ? ` · ${t('attendance.vestments.returned')} ${addisEthTime(returned)}` : ''}`}
      >
        <Shirt className="size-3.5" aria-hidden />
        {returned ? t('attendance.vestments.returned') : t('attendance.vestments.taken')}
      </span>
      {canChange && !returned && (
        <Button size="sm" className="h-8" disabled={busy} onClick={() => run('RETURNED')}>
          <Undo2 />
          {t('attendance.vestments.giveBack')}
        </Button>
      )}
      {canChange && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          title={t('attendance.vestments.undo')}
          aria-label={t('attendance.vestments.undo')}
          onClick={() => run(returned ? 'TAKEN' : 'NONE')}
        >
          <RotateCcw />
        </Button>
      )}
    </div>
  )
}

function RosterItem({
  row,
  statuses,
  editable,
  onMark,
  vestments,
  canVestment,
  onVestment,
}: {
  statuses: readonly AttendanceStatus[]
  row: RosterRow
  editable: boolean
  onMark: (row: RosterRow, status: AttendanceStatus | null, note?: string | null) => Promise<void>
  /** ልብሰ ስብሐት is handed out at this session. */
  vestments: boolean
  canVestment: boolean
  onVestment: (row: RosterRow, state: VestmentState) => Promise<void>
}) {
  const { t } = useTranslation()
  const status = row.record?.status
  const [note, setNote] = useState(row.record?.note ?? '')

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        {/* min-width keeps the name readable; when tight the status buttons wrap below instead. */}
        <MemberLink memberId={row.member.id} className="flex min-w-52 flex-1 items-center gap-3">
          <MemberAvatar member={row.member} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{memberFullName(row.member)}</span>
            <span className="block text-xs text-muted-foreground">
              {row.member.memberCode}
              {row.record?.checkedInAt &&
                ` · ${t('attendance.roster.checkedIn', { time: addisEthTime(row.record.checkedInAt) })}`}
              {!row.inRoster && (
                <span className="ml-1 rounded bg-accent px-1 text-accent-foreground">{t('attendance.roster.visitor')}</span>
              )}
              {row.permission?.excuse && (
                <span className="ml-1 rounded bg-primary/12 px-1 text-foreground">
                  {t('attendance.roster.excusedPermission', { code: row.permission.excuse.code })}
                </span>
              )}
              {row.permission?.graceMinutes != null && (
                <span className="ml-1 rounded bg-gold/20 px-1 text-foreground">
                  {t('attendance.roster.latePermission', { minutes: row.permission.graceMinutes })}
                </span>
              )}
              {row.permission?.leaveEarly && (
                <span className="ml-1 rounded bg-muted px-1 text-foreground">
                  {row.permission.leaveEarly.fromTime
                    ? t('attendance.roster.leaveEarlyAt', { time: formatTime(row.permission.leaveEarly.fromTime) })
                    : t('attendance.roster.leaveEarly')}
                </span>
              )}
            </span>
          </span>
        </MemberLink>
        {editable ? (
          <div className="flex gap-1" role="group" aria-label={memberFullName(row.member)}>
            {statuses.map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={status === st}
                title={t(`attendance.statuses.${st}`)}
                onClick={() => void onMark(row, status === st ? null : st)}
                className={cn(
                  'h-8 min-w-8 rounded-md border px-2 text-xs font-semibold transition-colors',
                  status === st ? cn(STATUS_STYLES[st], 'border-transparent') : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t(`attendance.statuses.${st}`)}
              </button>
            ))}
          </div>
        ) : (
          status && <AttendanceStatusBadge status={status} />
        )}
        {vestments && (
          <VestmentControl
            record={row.record}
            canChange={canVestment}
            onChange={(state) => onVestment(row, state)}
            name={memberFullName(row.member)}
          />
        )}
      </div>
      {editable && status === 'EXCUSED' && (
        <Input
          className="mt-2 h-8 text-sm"
          placeholder={t('attendance.roster.excuseReason')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (row.record?.note ?? '') && void onMark(row, 'EXCUSED', note || null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
      {!editable && row.record?.note && <p className="mt-1 text-xs text-muted-foreground">{row.record.note}</p>}
    </li>
  )
}
