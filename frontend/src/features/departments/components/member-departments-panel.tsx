import { MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import type { Member } from '@/features/members/types'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { departmentsApi, useDepartmentMutation } from '../api'
import { DEPARTMENT_ROLES, type DepartmentRole, type MemberDepartment } from '../types'
import { AddToDepartmentDialog } from './add-to-department-dialog'
import { RoleBadge } from './role-badge'

/** "Departments" panel on a member's page: where they serve, and (for managers) add/change/remove. */
export function MemberDepartmentsPanel({ member }: { member: Member }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { can, inDepartment } = useAuth()
  const canManage = can(PERMISSIONS.DEPARTMENTS_ROSTER)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<MemberDepartment | null>(null)

  const notifyError = (e: unknown) => toast.error(getErrorMessage(e))
  const changeRole = useDepartmentMutation((a: { id: number; role: DepartmentRole }) =>
    departmentsApi.updateMembership(a.id, { role: a.role }),
  )
  const remove = useDepartmentMutation(departmentsApi.removeMembership)

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{t('members.sections.departments.title')}</h2>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {t('departments.roster.addToDepartment')}
          </Button>
        )}
      </div>

      {member.departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('departments.roster.noneYet')}</p>
      ) : (
        <ul className="divide-y">
          {member.departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <Link to={`/departments/${d.department.id}`} className="text-sm font-medium hover:underline">
                  {name(d.department)}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {t('departments.roster.joinedAt')}: {formatDate(d.joinedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <RoleBadge role={d.role} />
                {canManage && inDepartment(d.department.id) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t('departments.roster.changeRole')}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{t('departments.roster.changeRole')}</DropdownMenuLabel>
                      {DEPARTMENT_ROLES.filter((r) => r !== d.role).map((r) => (
                        <DropdownMenuItem
                          key={r}
                          // The API refuses a second Head/Deputy and explains who holds it.
                          onSelect={() => changeRole.mutate({ id: d.id, role: r }, { onError: notifyError })}
                        >
                          {t(`departments.roles.${r}`)}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(d)}>
                        <Trash2 />
                        {t('departments.roster.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <AddToDepartmentDialog
          open={adding}
          onOpenChange={setAdding}
          member={member}
          currentDepartmentIds={member.departments.map((d) => d.department.id)}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('departments.roster.removeTitle')}
        description={
          removing
            ? t('departments.roster.removeBody', {
                name: memberFullName(member),
                department: name(removing.department),
              })
            : ''
        }
        confirmLabel={t('departments.roster.remove')}
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast.success(t('departments.roster.removed', { name: memberFullName(member) }))
              setRemoving(null)
            },
            onError: notifyError,
          })
        }}
      />
    </section>
  )
}
