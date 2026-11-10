import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, Loader2, Paperclip, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { todayIso } from '@/lib/ethiopian-calendar'
import { msg, translateMessage } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  type LatePermission,
  type LatePermissionInput,
  type PermissionMember,
  usePermissionCandidates,
  usePermissionDepartments,
  WEEKDAY_KEYS,
} from '../permissions-api'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
const EVIDENCE_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'

const schema = z
  .object({
    departmentId: z.string().min(1, msg('validation.required')),
    memberId: z.number({ message: msg('attendance.permissions.chooseMember') }).int().positive(msg('attendance.permissions.chooseMember')),
    graceMinutes: z.string().regex(/^\d{1,3}$/, msg('validation.required')),
    weekdays: z.array(z.number()).min(1, msg('attendance.permissions.chooseDays')),
    startsOn: z.string().min(1, msg('validation.required')),
    endsOn: z.string().min(1, msg('validation.required')),
    reason: z.string().trim().min(2, msg('validation.required')).max(500, msg('validation.tooLong', { max: 500 })),
  })
  .refine((v) => Number(v.graceMinutes) >= 1 && Number(v.graceMinutes) <= 240, {
    path: ['graceMinutes'],
    message: msg('attendance.permissions.graceRange'),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    path: ['endsOn'],
    message: msg('attendance.permissions.endBeforeStart'),
  })
type Values = z.infer<typeof schema>

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * Give (or change) a member's late permission for one department's classes
 * and service groups: grace minutes, weekdays, period, reason and, optionally,
 * an evidence file.
 */
export function LatePermissionDialog({
  open,
  onOpenChange,
  permission,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  permission?: LatePermission
  /** Saves the permission, then (when given) uploads the evidence file. */
  onSave: (input: LatePermissionInput, evidence: File | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { data: departments } = usePermissionDepartments()
  const [member, setMember] = useState<PermissionMember | null>(permission?.member ?? null)
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim())
  const [evidence, setEvidence] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      departmentId: permission ? String(permission.departmentId) : departments?.length === 1 ? String(departments[0]!.id) : '',
      memberId: permission?.memberId ?? 0,
      graceMinutes: permission ? String(permission.graceMinutes) : '30',
      weekdays: permission?.weekdays ?? [0],
      startsOn: permission?.startsOn ?? todayIso(),
      endsOn: permission?.endsOn ?? '',
      reason: permission?.reason ?? '',
    },
    resetOptions: { keepDirtyValues: true },
  })
  const { control, setValue } = form
  const departmentId = useWatch({ control, name: 'departmentId' })
  const weekdays = useWatch({ control, name: 'weekdays' })
  const { data: candidates, isFetching } = usePermissionCandidates(
    departmentId ? Number(departmentId) : null,
    query,
    open && !permission && member === null,
  )

  const chooseMember = (m: PermissionMember | null) => {
    setMember(m)
    setValue('memberId', m?.id ?? 0, { shouldValidate: m !== null })
  }
  const toggleDay = (day: number) =>
    setValue('weekdays', weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort(), {
      shouldValidate: true,
    })
  const pickFile = (file: File | undefined) => {
    setFileError(null)
    if (!file) return setEvidence(null)
    if (file.size > MAX_EVIDENCE_BYTES) {
      setEvidence(null)
      return setFileError(t('attendance.permissions.evidenceTooLarge'))
    }
    setEvidence(file)
  }

  const close = (o: boolean) => {
    if (!o) {
      setSearch('')
      setEvidence(null)
      setFileError(null)
      if (!permission) setMember(null)
      form.reset()
    }
    onOpenChange(o)
  }

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave(
        {
          departmentId: Number(v.departmentId),
          memberId: v.memberId,
          graceMinutes: Number(v.graceMinutes),
          weekdays: v.weekdays,
          startsOn: v.startsOn,
          endsOn: v.endsOn,
          reason: v.reason,
        },
        evidence,
      )
      close(false)
    } catch (error) {
      form.setError('root.server', { message: getErrorMessage(error) })
    }
  })

  const memberError = form.formState.errors.memberId?.message
  const daysError = form.formState.errors.weekdays?.message

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{permission ? t('attendance.permissions.edit') : t('attendance.permissions.new')}</DialogTitle>
          <DialogDescription>{t('attendance.permissions.dialogBody')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
          {(departments?.length ?? 0) > 1 && !permission && (
            <SelectField
              control={control}
              name="departmentId"
              label={t('attendance.permissions.fields.department')}
              required
              options={(departments ?? []).map((d) => ({ value: String(d.id), label: name(d) }))}
            />
          )}

          <Field data-invalid={memberError ? true : undefined}>
            <FieldLabel>
              {t('attendance.permissions.fields.member')} <span className="text-destructive">*</span>
            </FieldLabel>
            {member ? (
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <MemberAvatar member={member} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{memberFullName(member)}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{member.memberCode}</span>
                </span>
                {!permission && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => chooseMember(null)}>
                    <X />
                    {t('attendance.permissions.changeMember')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('attendance.permissions.memberSearch')}
                    aria-label={t('attendance.permissions.memberSearch')}
                    disabled={!departmentId}
                    className="pl-8"
                  />
                  {isFetching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
                {departmentId && (
                  <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-lg border p-1">
                    {(candidates ?? []).length === 0 ? (
                      <li className="px-2 py-3 text-center text-sm text-muted-foreground">{t('attendance.permissions.noMembers')}</li>
                    ) : (
                      (candidates ?? []).map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => chooseMember(m)}
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                          >
                            <MemberAvatar member={m} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{memberFullName(m)}</span>
                              <span className="block font-mono text-xs text-muted-foreground">{m.memberCode}</span>
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
            {memberError && <p className="text-sm text-destructive">{translateMessage(memberError)}</p>}
          </Field>

          <TextField
            control={control}
            name="graceMinutes"
            label={t('attendance.permissions.fields.grace')}
            description={t('attendance.permissions.fields.graceHint')}
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            required
          />

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('attendance.permissions.fields.days')} <span className="text-destructive">*</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const on = weekdays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                    )}
                  >
                    {t(WEEKDAY_KEYS[day])}
                  </button>
                )
              })}
            </div>
            {daysError && <p className="text-sm text-destructive">{translateMessage(daysError)}</p>}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <DateField control={control} name="startsOn" label={t('attendance.permissions.fields.from')} required />
            <DateField control={control} name="endsOn" label={t('attendance.permissions.fields.to')} required />
          </div>

          <TextareaField
            control={control}
            name="reason"
            label={t('attendance.permissions.fields.reason')}
            placeholder={t('attendance.permissions.fields.reasonPlaceholder')}
            rows={3}
            required
          />

          <Field>
            <FieldLabel htmlFor="permission-evidence">{t('attendance.permissions.fields.evidence')}</FieldLabel>
            {permission?.hasEvidence && !evidence && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="size-4" />
                {permission.evidenceName} · {t('attendance.permissions.evidenceReplace')}
              </p>
            )}
            <label
              htmlFor="permission-evidence"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm hover:bg-accent/50"
            >
              <Paperclip className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{evidence ? evidence.name : t('attendance.permissions.evidencePick')}</span>
            </label>
            <input
              id="permission-evidence"
              type="file"
              accept={EVIDENCE_TYPES}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <p className="text-xs text-muted-foreground">{t('attendance.permissions.evidenceHint')}</p>
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </Field>

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
              {permission ? t('common.save') : t('attendance.permissions.give')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
