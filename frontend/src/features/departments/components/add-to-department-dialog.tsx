import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { todayIso } from '@/lib/ethiopian-calendar'
import { departmentsApi, useDepartmentMembers, useDepartmentMutation, useDepartments } from '../api'
import { DEPARTMENT_ROLES, type DepartmentRole, type MemberSummary } from '../types'

const NONE = '__none__'

/**
 * Adds one member to a department (the member-side counterpart of the
 * department roster's "Add member"). Departments the member already serves
 * in are listed but disabled; Head/Deputy show who holds them.
 */
export function AddToDepartmentDialog({
  open,
  onOpenChange,
  member,
  currentDepartmentIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Pick<MemberSummary, 'id' | 'firstName' | 'fatherName' | 'grandfatherName'>
  currentDepartmentIds: number[]
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { inDepartment } = useAuth()
  // Department admins can only add people to their own departments.
  const departments = useDepartments().data?.filter((d) => inDepartment(d.id))
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [role, setRole] = useState<DepartmentRole>('MEMBER')
  const [joinedAt, setJoinedAt] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const roster = useDepartmentMembers(departmentId ?? 0)
  const add = useDepartmentMutation((a: { id: number; role: DepartmentRole; joinedAt: string }) =>
    departmentsApi.addMember(a.id, { memberId: member.id, role: a.role, joinedAt: a.joinedAt }),
  )

  const holderOf = (r: DepartmentRole) =>
    r === 'HEAD' || r === 'DEPUTY' ? roster.data?.find((m) => m.role === r)?.member : undefined
  const selected = departments?.find((d) => d.id === departmentId)

  const reset = () => {
    setDepartmentId(null)
    setRole('MEMBER')
    setJoinedAt(todayIso())
    setError(null)
  }
  const close = () => {
    reset()
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selected) return
    setError(null)
    try {
      await add.mutateAsync({ id: selected.id, role, joinedAt })
      toast.success(
        t('departments.roster.addedTo', { name: memberFullName(member), department: name(selected) }),
      )
      close()
    } catch (e) {
      setError(getErrorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('departments.roster.addToTitle', { name: memberFullName(member) })}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="add-to-dept">{t('departments.roster.department')}</FieldLabel>
            <Select
              value={departmentId ? String(departmentId) : NONE}
              onValueChange={(v) => {
                setDepartmentId(v === NONE ? null : Number(v))
                setRole('MEMBER')
              }}
            >
              <SelectTrigger id="add-to-dept" className="w-full">
                <SelectValue placeholder={t('departments.roster.chooseDepartment')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} disabled>
                  {t('departments.roster.chooseDepartment')}
                </SelectItem>
                {departments?.map((d) => {
                  const already = currentDepartmentIds.includes(d.id)
                  return (
                    <SelectItem key={d.id} value={String(d.id)} disabled={already}>
                      {d.parentId !== null && '— '}
                      {name(d)}
                      {already && (
                        <span className="text-muted-foreground"> · {t('departments.roster.alreadyIn')}</span>
                      )}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="add-to-role">{t('departments.roster.role')}</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as DepartmentRole)} disabled={!selected}>
                <SelectTrigger id="add-to-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_ROLES.map((r) => {
                    const holder = holderOf(r)
                    return (
                      <SelectItem key={r} value={r} disabled={Boolean(holder)}>
                        {t(`departments.roles.${r}`)}
                        {holder && (
                          <span className="text-muted-foreground">
                            {' '}
                            — {t('departments.roster.roleTaken', { name: memberFullName(holder) })}
                          </span>
                        )}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="add-to-joined">{t('departments.roster.joinedAt')}</FieldLabel>
              <EthDatePicker id="add-to-joined" value={joinedAt} onChange={(v) => setJoinedAt(v || todayIso())} />
            </Field>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={add.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!selected || add.isPending}>
            {add.isPending && <Loader2 className="animate-spin" />}
            {t('departments.roster.addToDepartment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
