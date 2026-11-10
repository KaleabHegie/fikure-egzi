import { CalendarClock, CalendarX2, FileText, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LatePermissionDialog } from '../components/late-permission-dialog'
import {
  type LatePermission,
  type LatePermissionInput,
  type PermissionState,
  permissionsApi,
  useLatePermissions,
  usePermissionDepartments,
  usePermissionMutation,
  WEEKDAY_KEYS,
} from '../permissions-api'

const ALL = 'all'
const STATE_STYLES: Record<PermissionState, string> = {
  active: 'bg-success/12 text-success',
  upcoming: 'bg-gold/20 text-foreground',
  ended: 'bg-muted text-muted-foreground',
}

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Opens a permission's evidence file in a new tab (it needs the sign-in, so it is fetched first). */
async function openEvidence(id: number) {
  const tab = window.open('', '_blank')
  const blob = await permissionsApi.evidence(id)
  const url = URL.createObjectURL(blob)
  if (tab) tab.location.href = url
  else window.location.assign(url)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Late permissions: members a department lets arrive late to its classes and
 * service groups on given days. Each department sees and manages only its own.
 */
export function LatePermissionsPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const [state, setState] = useState<PermissionState | typeof ALL>('active')
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim())
  const { data: departments } = usePermissionDepartments()
  const list = useLatePermissions({
    state,
    departmentId: departmentId === ALL ? undefined : Number(departmentId),
    search: query || undefined,
  })
  const [editing, setEditing] = useState<LatePermission | 'new' | null>(null)
  const [ending, setEnding] = useState<LatePermission | null>(null)
  const [deleting, setDeleting] = useState<LatePermission | null>(null)

  const save = usePermissionMutation(async (a: { id?: number; input: LatePermissionInput; evidence: File | null }) => {
    const saved = a.id ? await permissionsApi.update(a.id, a.input) : await permissionsApi.create(a.input)
    if (a.evidence) await permissionsApi.uploadEvidence(saved.id, a.evidence)
    return saved
  })
  const end = usePermissionMutation((id: number) => permissionsApi.end(id))
  const remove = usePermissionMutation((id: number) => permissionsApi.remove(id))

  const rows = list.data ?? []
  const days = (p: LatePermission) =>
    p.weekdays.length === 7 ? t('attendance.permissions.everyDay') : p.weekdays.map((d) => t(WEEKDAY_KEYS[d]!)).join('፣ ')

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('attendance.permissions.title')}
        description={t('attendance.permissions.description')}
        actions={
          <Button onClick={() => setEditing('new')} disabled={(departments?.length ?? 0) === 0}>
            <Plus />
            {t('attendance.permissions.new')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={state} onValueChange={(v) => setState(v as PermissionState | typeof ALL)}>
          <TabsList>
            <TabsTrigger value="active">{t('attendance.permissions.states.active')}</TabsTrigger>
            <TabsTrigger value="upcoming">{t('attendance.permissions.states.upcoming')}</TabsTrigger>
            <TabsTrigger value="ended">{t('attendance.permissions.states.ended')}</TabsTrigger>
            <TabsTrigger value={ALL}>{t('attendance.permissions.states.all')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {(departments?.length ?? 0) > 1 && (
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-60" aria-label={t('attendance.permissions.fields.department')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('attendance.permissions.allDepartments')}</SelectItem>
              {departments!.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {name(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('attendance.permissions.memberSearch')}
            aria-label={t('attendance.permissions.memberSearch')}
            className="pl-8"
          />
        </div>
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={query ? t('attendance.permissions.noMatch') : t('attendance.permissions.empty')}
          description={query ? undefined : t('attendance.permissions.emptyBody')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((p) => (
            <li key={p.id} className={cn('flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3', p.state === 'ended' && 'opacity-70')}>
              <div className="flex min-w-56 flex-1 items-center gap-3">
                <MemberAvatar member={p.member} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{memberFullName(p.member)}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="font-mono">{p.member.memberCode}</span> · {name(p.department)}
                  </span>
                </span>
              </div>
              <div className="grid min-w-44 gap-0.5 text-sm">
                <span className="font-semibold text-brand">{t('attendance.permissions.graceShort', { minutes: p.graceMinutes })}</span>
                <span className="text-xs text-muted-foreground">{days(p)}</span>
              </div>
              <div className="grid min-w-40 gap-0.5 text-xs text-muted-foreground">
                <span>
                  {formatDate(p.startsOn)} – {formatDate(p.endsOn)}
                </span>
                <span
                  className={cn('inline-flex h-5 w-fit items-center rounded-full px-2 text-xs font-medium', STATE_STYLES[p.state])}
                >
                  {p.revokedAt ? t('attendance.permissions.endedEarly') : t(`attendance.permissions.states.${p.state}`)}
                </span>
              </div>
              <p className="min-w-48 flex-[2] text-sm text-muted-foreground">
                {p.reason}
                {p.hasEvidence && (
                  <button
                    type="button"
                    onClick={() => void openEvidence(p.id).catch((e: unknown) => toast.error(getErrorMessage(e)))}
                    className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    <FileText className="size-3.5" />
                    {t('attendance.permissions.viewEvidence')}
                  </button>
                )}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('attendance.permissions.actions', { name: memberFullName(p.member) })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(p)}>
                    <Pencil />
                    {t('common.edit')}
                  </DropdownMenuItem>
                  {p.state !== 'ended' && (
                    <DropdownMenuItem onSelect={() => setEnding(p)}>
                      <CalendarX2 />
                      {t('attendance.permissions.end')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                    <Trash2 />
                    {t('attendance.permissions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <LatePermissionDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          permission={editing === 'new' ? undefined : editing}
          onSave={async (input, evidence) => {
            await save.mutateAsync({ id: editing === 'new' ? undefined : editing.id, input, evidence })
            toast.success(editing === 'new' ? t('attendance.permissions.given') : t('attendance.permissions.saved'))
          }}
        />
      )}
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(o) => !o && setEnding(null)}
        title={t('attendance.permissions.endTitle')}
        description={ending ? t('attendance.permissions.endBody', { name: memberFullName(ending.member) }) : ''}
        confirmLabel={t('attendance.permissions.end')}
        pending={end.isPending}
        onConfirm={() =>
          ending &&
          end.mutate(ending.id, {
            onSuccess: () => {
              toast.success(t('attendance.permissions.ended'))
              setEnding(null)
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('attendance.permissions.deleteTitle')}
        description={deleting ? t('attendance.permissions.deleteBody', { name: memberFullName(deleting.member) }) : ''}
        confirmLabel={t('attendance.permissions.delete')}
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('attendance.permissions.deleted'))
              setDeleting(null)
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </div>
  )
}
