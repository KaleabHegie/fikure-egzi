import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Loader2, Save } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { ErrorState } from '@/components/common/states'
import { TextField } from '@/components/form/form-fields'
import { PageHeader } from '@/components/layout/page-header'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { formatDateTime, initials } from '@/lib/format'
import { type Profile, profileApi, useProfile, useUpdateProfile } from '../api'

const KNOWN_ROLES = ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'ATTENDANCE_TAKER', 'TEACHER'] as const

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

const detailsSchema = z.object({
  fullName: z.string().trim().min(1, msg('validation.required')).max(150, msg('validation.tooLong', { max: 150 })),
  email: z.string().trim().email(msg('validation.email')),
  phone: z.string().trim().max(20, msg('validation.tooLong', { max: 20 })),
  currentPassword: z.string(),
})
type Details = z.infer<typeof detailsSchema>

function DetailsForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const update = useUpdateProfile()
  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    values: { fullName: profile.fullName, email: profile.email, phone: profile.phone ?? '', currentPassword: '' },
  })
  const { control } = form
  const email = useWatch({ control, name: 'email' })
  const emailChanged = email.trim().toLowerCase() !== profile.email

  const submit = form.handleSubmit(async (v) => {
    if (emailChanged && !v.currentPassword) {
      form.setError('currentPassword', { message: msg('profile.passwordForEmail') })
      return
    }
    try {
      await update.mutateAsync({
        fullName: v.fullName,
        email: v.email,
        phone: v.phone || null,
        ...(emailChanged && { currentPassword: v.currentPassword }),
      })
      toast.success(t('profile.saved'))
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, ['fullName', 'email', 'phone', 'currentPassword'])) {
        toast.error(getErrorMessage(error))
      }
    }
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <TextField control={control} name="fullName" label={t('users.fields.fullName')} required autoComplete="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={control} name="email" label={t('users.fields.email')} type="email" required autoComplete="email" />
        <TextField control={control} name="phone" label={t('users.fields.phone')} type="tel" autoComplete="tel" />
      </div>
      {emailChanged && (
        <TextField
          control={control}
          name="currentPassword"
          label={t('profile.currentPassword')}
          description={t('profile.passwordForEmail')}
          type="password"
          autoComplete="current-password"
          required
        />
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
          {t('profile.save')}
        </Button>
      </div>
    </form>
  )
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, msg('validation.required')),
    newPassword: z.string().min(8, msg('users.passwordTooShort')).max(72, msg('validation.tooLong', { max: 72 })),
    confirm: z.string(),
  })
  .refine((v) => v.confirm === v.newPassword, { path: ['confirm'], message: msg('profile.mismatch') })
type Passwords = z.infer<typeof passwordSchema>

function PasswordForm() {
  const { t } = useTranslation()
  const form = useForm<Passwords>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  })
  const { control } = form

  const submit = form.handleSubmit(async (v) => {
    try {
      await profileApi.changePassword(v.currentPassword, v.newPassword)
      form.reset()
      toast.success(t('profile.passwordChanged'))
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, ['currentPassword', 'newPassword'])) {
        toast.error(getErrorMessage(error))
      }
    }
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <TextField
        control={control}
        name="currentPassword"
        label={t('profile.currentPassword')}
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name="newPassword"
          label={t('profile.newPassword')}
          description={t('users.passwordTooShort')}
          type="password"
          autoComplete="new-password"
          required
        />
        <TextField control={control} name="confirm" label={t('profile.confirmPassword')} type="password" autoComplete="new-password" required />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {t('profile.changePassword')}
        </Button>
      </div>
    </form>
  )
}

/** Every signed-in user's own page: account details and password. */
export function ProfilePage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const profile = useProfile()

  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
  if (profile.isPending) return <Skeleton className="h-96 rounded-xl" />
  const p = profile.data
  const roleCode = p.role?.code
  const role =
    roleCode && (KNOWN_ROLES as readonly string[]).includes(roleCode)
      ? t(`userMenu.roles.${roleCode as (typeof KNOWN_ROLES)[number]}`)
      : (p.role?.name ?? '—')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('profile.title')} description={t('profile.description')} />

      <section className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-center">
        <Avatar className="size-16">
          <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">{initials(p.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold break-words">{p.fullName}</p>
          <p className="text-sm break-all text-muted-foreground">{p.email}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 lg:text-right">
          <Detail label={t('users.fields.role')}>{role}</Detail>
          <Detail label={t('users.lastLogin')}>{p.lastLoginAt ? formatDateTime(p.lastLoginAt) : t('users.never')}</Detail>
          {p.departments.length > 0 && (
            <Detail label={t('users.fields.departments')}>{p.departments.map((d) => name(d)).join('، ')}</Detail>
          )}
          {p.member && (
            <Detail label={t('profile.member')}>
              {memberFullName(p.member)} <span className="font-mono text-xs text-muted-foreground">{p.member.memberCode}</span>
            </Detail>
          )}
        </dl>
      </section>

      <Card title={t('profile.details')} description={t('profile.detailsHint')}>
        <DetailsForm profile={p} />
      </Card>

      <Card title={t('profile.password')} description={t('profile.passwordHint')}>
        <PasswordForm />
      </Card>
    </div>
  )
}
