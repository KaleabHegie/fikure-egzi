import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, SwitchField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { msg, translateMessage } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { memberFullName } from '@/features/members/utils'
import { useAssignableRoles, useMemberCandidates } from '../api'
import { type MemberCandidate, type SystemUser, type UserInput, USER_ROLES } from '../types'

const schema = z
  .object({
    fullName: z.string().trim().min(1, msg('validation.required')).max(150, msg('validation.tooLong', { max: 150 })),
    email: z.string().trim().email(msg('validation.email')),
    phone: z.string().trim().max(20, msg('validation.tooLong', { max: 20 })),
    roleCode: z.enum(USER_ROLES),
    departmentIds: z.array(z.number()),
    memberId: z.number().nullable(),
    password: z.string(),
    isActive: z.boolean(),
    creating: z.boolean(),
  })
  .refine((v) => !v.creating || v.password.length >= 8, { path: ['password'], message: msg('users.passwordTooShort') })
  .refine((v) => v.roleCode === 'SUPER_ADMIN' || v.departmentIds.length > 0, {
    path: ['departmentIds'],
    message: msg('users.chooseDepartment'),
  })
  .refine((v) => v.roleCode !== 'TEACHER' || v.memberId !== null, {
    path: ['memberId'],
    message: msg('users.memberRequired'),
  })
type Values = z.infer<typeof schema>

const FIELDS = ['fullName', 'email', 'phone', 'roleCode', 'departmentIds', 'memberId', 'password']

type LinkedMember = Pick<MemberCandidate, 'id' | 'memberCode' | 'firstName' | 'fatherName' | 'grandfatherName'>

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Picks the member a teacher login belongs to; members who already have a login can't be picked. */
function TeacherMemberField({
  selected,
  ownId,
  error,
  onSelect,
}: {
  selected: LinkedMember | null
  ownId?: number
  error?: string
  onSelect: (member: MemberCandidate | null) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim())
  const { data, isFetching } = useMemberCandidates(query, !selected)

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">
        {t('users.fields.member')} <span className="text-destructive">*</span>
      </legend>
      {selected ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <Check className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{memberFullName(selected)}</span>
            <span className="block font-mono text-xs text-muted-foreground">{selected.memberCode}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
            {t('users.fields.change')}
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('users.fields.memberSearch')}
              aria-label={t('users.fields.member')}
              aria-invalid={Boolean(error) || undefined}
            />
            {isFetching && (
              <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {data && (
            <ul className="max-h-52 overflow-y-auto rounded-md border" role="listbox" aria-label={t('users.fields.member')}>
              {data.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">{t('users.fields.noMembers')}</li>
              )}
              {data.map((m) => {
                const taken = m.hasLogin && m.id !== ownId
                return (
                  <li key={m.id} role="option" aria-selected={false} aria-disabled={taken}>
                    <button
                      type="button"
                      disabled={taken}
                      onClick={() => onSelect(m)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{memberFullName(m)}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{m.memberCode}</span>
                          {m.christianName && ` · ${m.christianName}`}
                        </span>
                      </span>
                      {taken && <span className="text-xs text-muted-foreground">{t('users.fields.hasLogin')}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t('users.fields.memberHint')}</p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {translateMessage(error)}
        </p>
      )}
    </fieldset>
  )
}

/** Create (`user` undefined) or edit a system user. */
export function UserDialog({
  open,
  onOpenChange,
  user,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: SystemUser
  onSave: (input: UserInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { user: me, inDepartment } = useAuth()
  const { data: roles } = useAssignableRoles()
  const { data: departments } = useDepartments()
  const self = user?.id === me?.id
  const firstRole = roles?.find((r) => r.code === 'ATTENDANCE_TAKER')?.code ?? roles?.[0]?.code ?? 'ATTENDANCE_TAKER'
  const ownDepartments = (departments ?? []).filter((d) => inDepartment(d.id))
  // The member picked in this sitting; undefined = still the saved one.
  const [picked, setLinked] = useState<LinkedMember | null | undefined>(undefined)
  const linked = picked === undefined ? (user?.member ?? null) : picked
  const close = (next: boolean) => {
    if (!next) setLinked(undefined)
    onOpenChange(next)
  }
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      roleCode: user?.role?.code ?? firstRole,
      // A department admin's new taker starts in their department when they have just one.
      departmentIds: user?.departments.map((d) => d.id) ?? (ownDepartments.length === 1 && me?.departmentIds ? [ownDepartments[0]!.id] : []),
      memberId: user?.member?.id ?? null,
      password: '',
      isActive: user?.isActive ?? true,
      creating: !user,
    },
  })
  const { control, setValue } = form
  const [roleCode, departmentIds] = useWatch({ control, name: ['roleCode', 'departmentIds'] })
  const scopedRole = roleCode !== 'SUPER_ADMIN'
  const departmentsError = form.formState.errors.departmentIds?.message

  const toggle = (id: number) =>
    setValue(
      'departmentIds',
      departmentIds.includes(id) ? departmentIds.filter((d) => d !== id) : [...departmentIds, id],
      { shouldValidate: form.formState.isSubmitted },
    )

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({
        fullName: v.fullName,
        email: v.email,
        phone: v.phone || null,
        roleCode: v.roleCode,
        departmentIds: v.roleCode === 'SUPER_ADMIN' ? [] : v.departmentIds,
        memberId: v.roleCode === 'TEACHER' ? v.memberId : null,
        ...(user ? { isActive: v.isActive } : { password: v.password }),
      })
      close(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, FIELDS)) form.setError('root.server', { message: getErrorMessage(error) })
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? t('users.edit') : t('users.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <TextField control={control} name="fullName" label={t('users.fields.fullName')} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="email" label={t('users.fields.email')} type="email" required autoComplete="off" />
            <TextField control={control} name="phone" label={t('users.fields.phone')} type="tel" />
          </div>
          {!user && (
            <TextField
              control={control}
              name="password"
              label={t('users.fields.password')}
              description={t('users.fields.passwordHint')}
              type="password"
              autoComplete="new-password"
              required
            />
          )}
          <SelectField
            control={control}
            name="roleCode"
            label={t('users.fields.role')}
            description={t(`users.roleHints.${roleCode}`)}
            required
            options={(roles ?? []).map((r) => ({ value: r.code, label: t(`userMenu.roles.${r.code}`) }))}
          />
          {self && <p className="-mt-2 text-xs text-muted-foreground">{t('users.selfRoleHint')}</p>}
          {roleCode === 'TEACHER' && (
            <TeacherMemberField
              selected={linked}
              ownId={user?.member?.id}
              error={form.formState.errors.memberId?.message}
              onSelect={(m) => {
                setLinked(m)
                setValue('memberId', m?.id ?? null, { shouldValidate: form.formState.isSubmitted })
                // A new teacher's name and phone come from their member record.
                if (m && !form.getValues('fullName')) setValue('fullName', memberFullName(m))
                if (m?.phone && !form.getValues('phone')) setValue('phone', m.phone)
              }}
            />
          )}
          {scopedRole && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">
                {t('users.fields.departments')} <span className="text-destructive">*</span>
              </legend>
              <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {ownDepartments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={departmentIds.includes(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                    <span className={cn(d.parentId === null && 'font-medium')}>{name(d)}</span>
                  </label>
                ))}
              </div>
              {departmentsError && (
                <p role="alert" className="text-sm text-destructive">
                  {translateMessage(departmentsError)}
                </p>
              )}
            </fieldset>
          )}
          {user && !self && (
            <SwitchField control={control} name="isActive" label={t('users.fields.isActive')} description={t('users.fields.isActiveHint')} />
          )}
          {form.formState.errors.root?.server && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {form.formState.errors.root.server.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={form.formState.isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {user ? t('users.save') : t('users.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
