import { Building2, ChevronRight, Crown, MoreHorizontal, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import {
  departmentsApi,
  useDepartment,
  useDepartmentMembers,
  useDepartmentMutation,
  useDepartments,
} from '../api'
import { AddMemberDialog } from '../components/add-member-dialog'
import { RoleBadge } from '../components/role-badge'
import { DepartmentDialog } from '../components/department-dialog'
import { FormerMembers } from '../components/former-members'
import { DEPARTMENT_ROLES, type DepartmentMembership, type DepartmentRole } from '../types'

export function DepartmentDetailPage() {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const id = Number(useParams().id)
  const { can, inDepartment } = useAuth()
  const canEdit = can(PERMISSIONS.DEPARTMENTS_MANAGE)
  // Department admins manage the roster of their own departments only.
  const canManage = can(PERMISSIONS.DEPARTMENTS_ROSTER) && inDepartment(id)
  const department = useDepartment(id)
  const roster = useDepartmentMembers(id)
  const { data: all } = useDepartments(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [creatingChild, setCreatingChild] = useState(false)
  const [removing, setRemoving] = useState<DepartmentMembership | null>(null)

  const notifyError = (e: unknown) => toast.error(getErrorMessage(e))
  const addMember = useDepartmentMutation((a: Parameters<typeof departmentsApi.addMember>[1]) =>
    departmentsApi.addMember(id, a),
  )
  const changeRole = useDepartmentMutation((a: { membershipId: number; role: DepartmentRole }) =>
    departmentsApi.updateMembership(a.membershipId, { role: a.role }),
  )
  const removeMember = useDepartmentMutation(departmentsApi.removeMembership)
  const update = useDepartmentMutation((input: Parameters<typeof departmentsApi.update>[1]) =>
    departmentsApi.update(id, input),
  )
  const createChild = useDepartmentMutation((input: Parameters<typeof departmentsApi.createSubDepartment>[1]) =>
    departmentsApi.createSubDepartment(id, input),
  )

  if (department.isError) return <ErrorState error={department.error} onRetry={() => void department.refetch()} />
  if (department.isPending) return <Skeleton className="h-96 w-full rounded-xl" />

  const d = department.data
  const amharic = i18n.language === 'am'
  const description = amharic ? d.descriptionAm : d.descriptionEn
  const members = roster.data ?? []
  const children = (all ?? []).filter((x) => x.parentId === d.id)
  const summary = (all ?? []).find((x) => x.id === d.id)
  const holder = (role: DepartmentRole) =>
    role === 'HEAD' || role === 'DEPUTY' ? members.find((m) => m.role === role) : undefined

  return (
    <>
      <PageHeader
        back={
          d.parent
            ? { to: `/departments/${d.parent.id}`, label: name(d.parent) }
            : { to: '/departments', label: t('nav.departments') }
        }
        title={name(d)}
        description={
          <>
            {amharic ? d.nameEn : d.nameAm}
            {description && ` · ${description}`}
            {d.parent && (
              <span className="block">{t('departments.administeredBy', { name: name(d.parent) })}</span>
            )}
          </>
        }
        actions={
          (canEdit || canManage) && (
            <>
              {canEdit && (
                <Button variant="outline" size="lg" onClick={() => setEditOpen(true)}>
                  <Pencil />
                  {t('common.edit')}
                </Button>
              )}
              {canManage && (
                <>
                  <Button variant="outline" size="lg" onClick={() => setCreatingChild(true)} disabled={!d.isActive || members.length === 0}>
                    <Plus />
                    {t('departments.newSubDepartment')}
                  </Button>
                  <Button size="lg" onClick={() => setAddOpen(true)} disabled={!d.isActive}>
                    <UserPlus />
                    {t('departments.roster.add')}
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      <section className="overflow-hidden rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-4" />
            </span>
            <div>
              <h2 className="font-heading text-base font-semibold">{t('departments.subDepartments.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('departments.subDepartments.description')}</p>
            </div>
          </div>
          <span className="tabular text-sm text-muted-foreground">{t('departments.subDepartments.count', { count: children.length })}</span>
        </header>
        {children.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
            <p className="text-sm text-muted-foreground">{t('departments.subDepartments.empty')}</p>
            {canManage && d.isActive && members.length > 0 && (
              <Button size="sm" onClick={() => setCreatingChild(true)}>
                <Plus />
                {t('departments.newSubDepartment')}
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  to={`/departments/${child.id}`}
                  className={cn(
                    'group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    !child.isActive && 'opacity-60',
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Building2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name(child)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{amharic ? child.nameEn : child.nameAm}</span>
                  </span>
                  {child.head ? (
                    <span className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                      <Crown className="size-3.5 shrink-0 text-gold" />
                      <span className="max-w-36 truncate">{memberFullName(child.head)}</span>
                    </span>
                  ) : (
                    <span className="hidden text-sm text-muted-foreground sm:block">{t('departments.noHead')}</span>
                  )}
                  <span className="tabular text-xs text-muted-foreground">{t('departments.members', { count: child.memberCount })}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-medium">{t('departments.roster.title')}</h2>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="size-4" />
            {t('departments.members', { count: summary?.memberCount ?? members.length })}
          </span>
        </header>
        {roster.isError ? (
          <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />
        ) : roster.isPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('departments.noMembers')}
            action={
              canManage &&
              d.isActive && (
                <Button onClick={() => setAddOpen(true)}>
                  <UserPlus />
                  {t('departments.roster.add')}
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">{t('departments.roster.member')}</TableHead>
                <TableHead>{t('departments.roster.role')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('members.table.phone')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('departments.roster.joinedAt')}</TableHead>
                {canManage && <TableHead className="w-10 pr-5" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-5">
                    <Link to={`/members/${m.member.id}`} className="flex items-center gap-3 hover:underline">
                      <MemberAvatar member={m.member} />
                      <span>
                        <span className="block font-medium">{memberFullName(m.member)}</span>
                        <span className="block text-xs text-muted-foreground">{m.member.memberCode}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={m.role} />
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap sm:table-cell">
                    {formatPhone(m.member.phone) || '—'}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    {formatDate(m.joinedAt)}
                  </TableCell>
                  {canManage && (
                    <TableCell className="pr-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('members.table.actions', { name: memberFullName(m.member) })}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{t('departments.roster.changeRole')}</DropdownMenuLabel>
                          {DEPARTMENT_ROLES.filter((r) => r !== m.role).map((r) => {
                            const taken = holder(r)
                            return (
                              <DropdownMenuItem
                                key={r}
                                disabled={Boolean(taken)}
                                onSelect={() =>
                                  changeRole.mutate({ membershipId: m.id, role: r }, { onError: notifyError })
                                }
                              >
                                {t(`departments.roles.${r}`)}
                                {taken && (
                                  <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                    {t('departments.roster.roleTaken', { name: taken.member.firstName })}
                                  </span>
                                )}
                              </DropdownMenuItem>
                            )
                          })}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                            <Trash2 />
                            {t('departments.roster.remove')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <FormerMembers departmentId={id} />

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        departmentId={d.id}
        departmentName={name(d)}
        roster={members}
        onAdd={async ({ member, role, joinedAt }) => {
          await addMember.mutateAsync({ memberId: member.id, role, joinedAt })
          toast.success(t('departments.roster.added', { name: memberFullName(member) }))
        }}
      />

      {summary && (
        <DepartmentDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          department={summary}
          allDepartments={all ?? []}
          onSave={async ({ code: _code, ...input }) => {
            await update.mutateAsync(input)
            toast.success(t('departments.saved'))
          }}
        />
      )}

      <DepartmentDialog
        open={creatingChild}
        onOpenChange={setCreatingChild}
        defaultParentId={d.id}
        allDepartments={all ?? []}
        headMembers={members}
        onSave={async ({ parentId: _parentId, ...input }, headMemberId) => {
          if (!headMemberId) return
          await createChild.mutateAsync({ ...input, headMemberId })
          toast.success(t('departments.created'))
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('departments.roster.removeTitle')}
        description={
          removing
            ? t('departments.roster.removeBody', { name: memberFullName(removing.member), department: name(d) })
            : ''
        }
        confirmLabel={t('departments.roster.remove')}
        destructive
        pending={removeMember.isPending}
        onConfirm={() => {
          if (!removing) return
          removeMember.mutate(removing.id, {
            onSuccess: () => {
              toast.success(t('departments.roster.removed', { name: memberFullName(removing.member) }))
              setRemoving(null)
            },
            onError: notifyError,
          })
        }}
      />
    </>
  )
}
