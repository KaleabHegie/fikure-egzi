import {
  ArrowRightLeft,
  CalendarRange,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { serviceGroupsApi, useServiceGroupMutation, useServiceGroups, useServiceTerms } from '../api'
import { AssignDialog } from '../components/assign-dialog'
import { DistributeDialog } from '../components/distribute-dialog'
import { GroupDialog } from '../components/group-dialog'
import { TermDialog } from '../components/term-dialog'
import type { GroupMember, ServiceGroup, ServiceTerm } from '../types'

type DialogState =
  | { kind: 'term'; term?: ServiceTerm }
  | { kind: 'deleteTerm'; term: ServiceTerm }
  | { kind: 'group'; group?: ServiceGroup }
  | { kind: 'deleteGroup'; group: ServiceGroup }
  | { kind: 'assign'; group: ServiceGroup }
  | { kind: 'distribute' }
  | { kind: 'remove'; group: ServiceGroup; member: GroupMember }
  | null

/**
 * Lower-cases and folds the Ge'ez letters that sound the same (ሐ/ኀ → ሀ, ሠ → ሰ,
 * ዐ → አ, ፀ → ጸ, ሃ → ሀ, ኣ → አ) so a search finds a name however it was spelt.
 */
function fold(text: string): string {
  return [...text.toLowerCase().replace(/\s+/g, ' ')]
    .map((c) => {
      let p = c.codePointAt(0)!
      if (p >= 0x1210 && p <= 0x1217) p -= 0x10
      else if (p >= 0x1280 && p <= 0x1286) p -= 0x80
      else if (p >= 0x1220 && p <= 0x1227) p += 0x10
      else if (p >= 0x12d0 && p <= 0x12d6) p -= 0x30
      else if (p >= 0x1340 && p <= 0x1346) p -= 0x08
      if (p === 0x1203) p = 0x1200
      if (p === 0x12a3) p = 0x12a0
      return String.fromCodePoint(p)
    })
    .join('')
    .trim()
}

function GroupCard({
  group,
  index,
  groups,
  canManage,
  onDialog,
  onMove,
  shown = group.members,
}: {
  group: ServiceGroup
  /** Members to list: all of them, or those matching the search. */
  shown?: GroupMember[]
  index: number
  groups: ServiceGroup[]
  canManage: boolean
  onDialog: (d: DialogState) => void
  onMove: (member: GroupMember, to: ServiceGroup) => void
}) {
  // `groups` are the ones the user may move members into.
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const others = groups.filter((g) => g.id !== group.id)
  const stack = group.members.slice(0, 5)
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <header className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="tabular grid size-9 shrink-0 place-items-center rounded-lg bg-accent font-record text-base font-semibold text-accent-foreground"
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{name(group)}</h2>
              <p className="truncate text-xs text-muted-foreground">
                {i18n.language === 'am' ? group.nameEn : group.nameAm}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => onDialog({ kind: 'assign', group })}>
                <UserPlus />
                {t('serviceGroups.addMembers')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('serviceGroups.editGroup')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onDialog({ kind: 'group', group })}>
                    <Pencil />
                    {t('common.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onDialog({ kind: 'deleteGroup', group })}>
                    <Trash2 />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {group.classGrade && (
            <span className="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-xs font-medium text-accent-foreground">
              {name(group.classGrade.classType)} · {gradeLabel(group.classGrade)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {t('serviceGroups.memberCount', { count: group.members.length })} ·{' '}
            {t('serviceGroups.sessionCount', { count: group.sessionCount })}
          </span>
          {stack.length > 0 && (
            <span className="ml-auto flex -space-x-2" aria-hidden>
              {stack.map((m) => (
                <MemberAvatar key={m.id} member={m} className="ring-2 ring-card" />
              ))}
              {group.members.length > stack.length && (
                <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                  +{group.members.length - stack.length}
                </span>
              )}
            </span>
          )}
        </div>
        {group.notes && <p className="text-xs text-muted-foreground">{group.notes}</p>}
      </header>
      {group.members.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t('serviceGroups.noMembers')}</p>
      ) : (
        <ul className="scrollbar-quiet max-h-80 divide-y divide-border/70 overflow-y-auto">
          {shown.length < group.members.length && (
            <li className="bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
              {t('serviceGroups.search.showing', { shown: shown.length, total: group.members.length })}
            </li>
          )}
          {shown.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40">
              <MemberAvatar member={m} />
              <Link to={`/members/${m.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-medium">{memberFullName(m)}</span>
                <span className="font-mono text-xs text-muted-foreground">{m.memberCode}</span>
              </Link>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t('serviceGroups.memberActions', { name: memberFullName(m) })}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {others.length > 0 && (
                      <>
                        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ArrowRightLeft className="size-3.5" />
                          {t('serviceGroups.moveTo')}
                        </DropdownMenuLabel>
                        {others.map((g) => (
                          <DropdownMenuItem key={g.id} onSelect={() => onMove(m, g)}>
                            {name(g)}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem variant="destructive" onSelect={() => onDialog({ kind: 'remove', group, member: m })}>
                      <UserMinus />
                      {t('serviceGroups.removeFromGroup')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ServiceGroupsPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { user, can, inDepartment } = useAuth()
  const { data: classTypes } = useClassTypes()
  const canManage = can(PERMISSIONS.SERVICE_GROUPS_MANAGE)
  // Department admins organise only the groups of classes their department runs (e.g. Mezmur);
  // terms are shared, so only the office or a department that runs a class can change them.
  const typeDepartment = new Map((classTypes ?? []).map((type) => [type.id, type.departmentId]))
  const managesGroup = (g: ServiceGroup) =>
    canManage && inDepartment(g.classGrade ? typeDepartment.get(g.classGrade.classType.id) : null)
  const canManageTerms =
    canManage && (user?.departmentIds === null || (classTypes ?? []).some((type) => inDepartment(type.departmentId)))
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [search, setSearch] = useState('')
  const terms = useServiceTerms()

  const termList = terms.data ?? []
  const requested = Number(params.get('term'))
  const term =
    termList.find((x) => x.id === requested) ?? termList.find((x) => x.isCurrent) ?? termList[0]
  const groups = useServiceGroups(term?.id)
  const groupList = groups.data ?? []
  const manageableGroups = groupList.filter(managesGroup)
  const assigned = groupList.reduce((n, g) => n + g.members.length, 0)
  // Search: a group's name or level shows the whole group; a member's name or ID
  // shows the groups they are in, listing only the matching members.
  const words = fold(search).split(' ').filter(Boolean)
  const results = groupList
    .map((g, index) => {
      if (words.length === 0) return { group: g, index, shown: g.members }
      const about = fold(
        [g.nameAm, g.nameEn, g.classGrade?.nameAm, g.classGrade?.nameEn, g.classGrade?.classType.nameAm, g.classGrade?.classType.nameEn].join(' '),
      )
      if (words.every((w) => about.includes(w))) return { group: g, index, shown: g.members }
      const shown = g.members.filter((m) => {
        const text = fold([m.firstName, m.fatherName, m.grandfatherName, m.christianName, m.memberCode].join(' '))
        return words.every((w) => text.includes(w))
      })
      return shown.length > 0 ? { group: g, index, shown } : null
    })
    .filter((r) => r !== null)
  const matchedMembers = results.reduce((n, r) => n + r.shown.length, 0)

  const selectTerm = (id: number) => setParams({ term: String(id) }, { replace: true })
  const notifyError = (e: unknown) => toast.error(getErrorMessage(e))
  const close = () => setDialog(null)

  const saveTerm = useServiceGroupMutation((a: { id?: number; input: Parameters<typeof serviceGroupsApi.createTerm>[0] }) =>
    a.id ? serviceGroupsApi.updateTerm(a.id, a.input) : serviceGroupsApi.createTerm(a.input),
  )
  const makeCurrent = useServiceGroupMutation((id: number) => serviceGroupsApi.updateTerm(id, { isCurrent: true }))
  const removeTerm = useServiceGroupMutation(serviceGroupsApi.removeTerm)
  const saveGroup = useServiceGroupMutation((a: { id?: number; input: Parameters<typeof serviceGroupsApi.createGroup>[1] }) =>
    a.id ? serviceGroupsApi.updateGroup(a.id, a.input) : serviceGroupsApi.createGroup(term!.id, a.input),
  )
  const removeGroup = useServiceGroupMutation(serviceGroupsApi.removeGroup)
  const assign = useServiceGroupMutation((a: { groupId: number; memberIds: number[] }) =>
    serviceGroupsApi.assign(a.groupId, a.memberIds),
  )
  const unassign = useServiceGroupMutation((a: { groupId: number; memberId: number }) =>
    serviceGroupsApi.unassign(a.groupId, a.memberId),
  )
  const distribute = useServiceGroupMutation((input: Parameters<typeof serviceGroupsApi.distribute>[1]) =>
    serviceGroupsApi.distribute(term!.id, input),
  )

  const header = (
    <PageHeader
      title={t('serviceGroups.title')}
      description={t('serviceGroups.description')}
      actions={
        canManageTerms && (
          <Button onClick={() => setDialog({ kind: 'term' })}>
            <Plus />
            {t('serviceGroups.newTerm')}
          </Button>
        )
      }
    />
  )

  const termActions = term && canManageTerms && (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'group' })}>
        <Plus />
        {t('serviceGroups.newGroup')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={manageableGroups.length === 0}
        onClick={() => setDialog({ kind: 'distribute' })}
      >
        <Shuffle />
        {t('serviceGroups.distribute.button')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('serviceGroups.editTerm')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog({ kind: 'term', term })}>
            <Pencil />
            {t('serviceGroups.editTerm')}
          </DropdownMenuItem>
          {!term.isCurrent && (
            <DropdownMenuItem
              onSelect={() =>
                makeCurrent.mutate(term.id, {
                  onSuccess: () => toast.success(t('serviceGroups.madeCurrent')),
                  onError: notifyError,
                })
              }
            >
              <Star />
              {t('serviceGroups.makeCurrent')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: 'deleteTerm', term })}>
            <Trash2 />
            {t('serviceGroups.deleteTerm')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  let body: React.ReactNode
  if (terms.isPending) {
    body = <Skeleton className="h-64 rounded-xl" />
  } else if (terms.isError) {
    body = <ErrorState error={terms.error} onRetry={() => void terms.refetch()} />
  } else if (!term) {
    body = (
      <EmptyState
        icon={UsersRound}
        title={t('serviceGroups.noTerms')}
        description={t('serviceGroups.noTermsBody')}
        action={
          canManageTerms && (
            <Button onClick={() => setDialog({ kind: 'term' })}>
              <Plus />
              {t('serviceGroups.newTerm')}
            </Button>
          )
        }
      />
    )
  } else {
    body = (
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* The term filter: a dropdown with its label on show. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label
                htmlFor="term-select"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <CalendarRange className="size-4 shrink-0" />
                {t('serviceGroups.term')}
              </label>
              <Select value={String(term.id)} onValueChange={(v) => selectTerm(Number(v))}>
                <SelectTrigger id="term-select" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {termList.map((x) => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      {name(x)}
                      {x.isCurrent && ` · ${t('serviceGroups.current')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {term.isCurrent && (
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-success/12 px-2 text-xs font-medium text-success">
                  <Star className="size-3 fill-gold text-gold" aria-hidden />
                  {t('serviceGroups.current')}
                </span>
              )}
            </div>
            {termActions}
          </div>
          {/* The term's facts on a register line: period, groups, members. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-dashed pt-3 text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarRange className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="tabular">
                {formatDate(term.startsOn)} – {formatDate(term.endsOn)}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <UsersRound className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="tabular font-medium">{t('serviceGroups.groupCount', { count: groupList.length })}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="tabular font-medium">{t('serviceGroups.memberCount', { count: assigned })}</span>
            </span>
          </div>
        </div>
        {groups.isPending ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : groups.isError ? (
          <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
        ) : groupList.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={t('serviceGroups.noGroups')}
            description={t('serviceGroups.noGroupsBody')}
            className="rounded-xl border bg-card"
            action={
              canManageTerms && (
                <Button onClick={() => setDialog({ kind: 'group' })}>
                  <Plus />
                  {t('serviceGroups.newGroup')}
                </Button>
              )
            }
          />
        ) : (
          <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('serviceGroups.search.placeholder')}
                aria-label={t('serviceGroups.search.placeholder')}
                className="pl-8"
              />
            </div>
            {words.length > 0 && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t('serviceGroups.search.found', { groups: results.length, members: matchedMembers })}
              </p>
            )}
          </div>
          {results.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('serviceGroups.search.noMatch')}
              description={t('serviceGroups.search.noMatchBody')}
              className="rounded-xl border bg-card"
            />
          ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {results.map(({ group: g, index: i, shown }) => (
              <GroupCard
                key={g.id}
                group={g}
                shown={shown}
                index={i}
                groups={manageableGroups}
                canManage={managesGroup(g)}
                onDialog={setDialog}
                onMove={(member, to) =>
                  assign.mutate(
                    { groupId: to.id, memberIds: [member.id] },
                    {
                      onSuccess: () => toast.success(t('serviceGroups.moved', { name: memberFullName(member), group: name(to) })),
                      onError: notifyError,
                    },
                  )
                }
              />
            ))}
          </div>
          )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      {body}

      <TermDialog
        open={dialog?.kind === 'term'}
        onOpenChange={(o) => !o && close()}
        term={dialog?.kind === 'term' ? dialog.term : undefined}
        terms={termList}
        onSave={async (input) => {
          const id = dialog?.kind === 'term' ? dialog.term?.id : undefined
          const saved = await saveTerm.mutateAsync({ id, input })
          if (!id) selectTerm(saved.id)
          toast.success(t('serviceGroups.saved'))
        }}
      />
      {term && (
        <GroupDialog
          open={dialog?.kind === 'group'}
          onOpenChange={(o) => !o && close()}
          group={dialog?.kind === 'group' ? dialog.group : undefined}
          nextNumber={groupList.length + 1}
          onSave={async (input) => {
            await saveGroup.mutateAsync({ id: dialog?.kind === 'group' ? dialog.group?.id : undefined, input })
            toast.success(t('serviceGroups.saved'))
          }}
        />
      )}
      {dialog?.kind === 'assign' && (
        <AssignDialog
          open
          onOpenChange={(o) => !o && close()}
          group={dialog.group}
          onAssign={async (memberIds) => {
            await assign.mutateAsync({ groupId: dialog.group.id, memberIds })
            toast.success(t('serviceGroups.assigned', { count: memberIds.length }))
          }}
        />
      )}
      {dialog?.kind === 'distribute' && (
        <DistributeDialog
        open
        onOpenChange={(o) => !o && close()}
        groups={manageableGroups}
        onDistribute={async (input) => {
          const result = await distribute.mutateAsync(input)
          toast.success(t('serviceGroups.distribute.done', { count: result.assigned }))
        }}
      />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'deleteTerm'}
        onOpenChange={(o) => !o && close()}
        title={t('serviceGroups.deleteTermTitle')}
        description={t('serviceGroups.deleteTermBody')}
        confirmLabel={t('common.delete')}
        destructive
        pending={removeTerm.isPending}
        onConfirm={() =>
          dialog?.kind === 'deleteTerm' &&
          removeTerm.mutate(dialog.term.id, {
            onSuccess: () => {
              setParams({}, { replace: true })
              toast.success(t('serviceGroups.deleted'))
              close()
            },
            onError: (e) => {
              notifyError(e)
              close()
            },
          })
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteGroup'}
        onOpenChange={(o) => !o && close()}
        title={t('serviceGroups.deleteGroupTitle')}
        description={t('serviceGroups.deleteGroupBody')}
        confirmLabel={t('common.delete')}
        destructive
        pending={removeGroup.isPending}
        onConfirm={() =>
          dialog?.kind === 'deleteGroup' &&
          removeGroup.mutate(dialog.group.id, {
            onSuccess: () => {
              toast.success(t('serviceGroups.deleted'))
              close()
            },
            onError: (e) => {
              notifyError(e)
              close()
            },
          })
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        onOpenChange={(o) => !o && close()}
        title={t('serviceGroups.removeTitle')}
        description={
          dialog?.kind === 'remove'
            ? t('serviceGroups.removeBody', { name: memberFullName(dialog.member), group: name(dialog.group) })
            : ''
        }
        confirmLabel={t('serviceGroups.removeFromGroup')}
        destructive
        pending={unassign.isPending}
        onConfirm={() =>
          dialog?.kind === 'remove' &&
          unassign.mutate(
            { groupId: dialog.group.id, memberId: dialog.member.id },
            { onSuccess: close, onError: notifyError },
          )
        }
      />
    </div>
  )
}
