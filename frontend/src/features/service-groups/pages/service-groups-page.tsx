import {
  ArrowRightLeft,
  CalendarRange,
  MoreHorizontal,
  Pencil,
  Plus,
  Shuffle,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
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

function GroupCard({
  group,
  groups,
  canManage,
  onDialog,
  onMove,
}: {
  group: ServiceGroup
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
  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h2 className="font-semibold">{name(group)}</h2>
          <p className="text-xs text-muted-foreground">
            {i18n.language === 'am' ? group.nameEn : group.nameAm}
            {group.classGrade && ` · ${name(group.classGrade.classType)} · ${gradeLabel(group.classGrade)}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('serviceGroups.memberCount', { count: group.members.length })} ·{' '}
            {t('serviceGroups.sessionCount', { count: group.sessionCount })}
          </p>
          {group.notes && <p className="mt-1 text-xs text-muted-foreground">{group.notes}</p>}
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
      </header>
      {group.members.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t('serviceGroups.noMembers')}</p>
      ) : (
        <ul className="max-h-96 divide-y overflow-y-auto">
          {group.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2">
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
  const terms = useServiceTerms()

  const termList = terms.data ?? []
  const requested = Number(params.get('term'))
  const term =
    termList.find((x) => x.id === requested) ?? termList.find((x) => x.isCurrent) ?? termList[0]
  const groups = useServiceGroups(term?.id)
  const groupList = groups.data ?? []
  const manageableGroups = groupList.filter(managesGroup)
  const assigned = groupList.reduce((n, g) => n + g.members.length, 0)

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
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Select value={String(term.id)} onValueChange={(v) => selectTerm(Number(v))}>
              <SelectTrigger className="w-48" aria-label={t('serviceGroups.term')}>
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
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarRange className="size-4 shrink-0" />
                {formatDate(term.startsOn)} – {formatDate(term.endsOn)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('serviceGroups.groupCount', { count: groupList.length })} ·{' '}
                {t('serviceGroups.memberCount', { count: assigned })}
              </p>
            </div>
            {term.isCurrent && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-success/12 px-2 text-xs font-medium text-success">
                {t('serviceGroups.current')}
              </span>
            )}
          </div>
          {canManageTerms && (
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
          )}
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
          <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {groupList.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
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
