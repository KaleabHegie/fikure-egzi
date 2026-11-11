import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, Loader2, Paperclip, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextareaField, TextField, TimeField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { msg, translateMessage } from '@/i18n'
import { getErrorMessage } from '@/lib/api/errors'
import { todayIso } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import {
  type LatePermission,
  type LatePermissionInput,
  PERMISSION_DECISIONS,
  PERMISSION_TYPES,
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
    memberId: z.number().int().positive(msg('attendance.permissions.chooseMember')),
    contactPhone: z.string().trim().max(20, msg('validation.tooLong', { max: 20 })),
    requestedOn: z.string().min(1, msg('validation.required')),
    type: z.enum(PERMISSION_TYPES),
    typeOther: z.string().trim().max(150, msg('validation.tooLong', { max: 150 })),
    graceMinutes: z.string(),
    weekdays: z.array(z.number()),
    startsOn: z.string().min(1, msg('validation.required')),
    endsOn: z.string().min(1, msg('validation.required')),
    timed: z.boolean(),
    fromTime: z.string(),
    toTime: z.string(),
    reason: z.string().trim().min(2, msg('validation.required')).max(500, msg('validation.tooLong', { max: 500 })),
    memberConfirmed: z.boolean(),
    memberConfirmedOn: z.string(),
    decision: z.enum(PERMISSION_DECISIONS),
    decidedOn: z.string(),
    representativeName: z.string().trim().max(150, msg('validation.tooLong', { max: 150 })),
    headName: z.string().trim().max(150, msg('validation.tooLong', { max: 150 })),
  })
  .refine((v) => v.type !== 'LATE_ARRIVAL' || (/^\d{1,3}$/.test(v.graceMinutes) && +v.graceMinutes >= 1 && +v.graceMinutes <= 240), {
    path: ['graceMinutes'],
    message: msg('attendance.permissions.graceRange'),
  })
  .refine((v) => v.type !== 'LATE_ARRIVAL' || v.weekdays.length > 0, {
    path: ['weekdays'],
    message: msg('attendance.permissions.chooseDays'),
  })
  .refine((v) => v.type !== 'OTHER' || v.typeOther.length > 0, {
    path: ['typeOther'],
    message: msg('attendance.permissions.sayWhat'),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    path: ['endsOn'],
    message: msg('attendance.permissions.endBeforeStart'),
  })
  .refine((v) => !v.timed || v.toTime > v.fromTime, {
    path: ['toTime'],
    message: msg('attendance.permissions.timeOrder'),
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

function initialValues(permission: LatePermission | undefined, departmentId: string): Values {
  const today = todayIso()
  if (!permission) {
    return {
      departmentId,
      memberId: 0,
      contactPhone: '',
      requestedOn: today,
      type: 'LATE_ARRIVAL',
      typeOther: '',
      graceMinutes: '30',
      weekdays: [0],
      startsOn: today,
      endsOn: today,
      timed: false,
      fromTime: '08:00',
      toTime: '10:00',
      reason: '',
      memberConfirmed: true,
      memberConfirmedOn: today,
      decision: 'APPROVED',
      decidedOn: today,
      representativeName: '',
      headName: '',
    }
  }
  return {
    departmentId: String(permission.departmentId),
    memberId: permission.memberId,
    contactPhone: permission.contactPhone ?? '',
    requestedOn: permission.requestedOn,
    type: permission.type,
    typeOther: permission.typeOther ?? '',
    graceMinutes: permission.graceMinutes ? String(permission.graceMinutes) : '30',
    weekdays: permission.type === 'LATE_ARRIVAL' ? permission.weekdays : [0],
    startsOn: permission.startsOn,
    endsOn: permission.endsOn,
    timed: permission.fromTime !== null,
    fromTime: permission.fromTime ?? '08:00',
    toTime: permission.toTime ?? '10:00',
    reason: permission.reason,
    memberConfirmed: permission.memberConfirmed,
    memberConfirmedOn: permission.memberConfirmedOn ?? today,
    decision: permission.decision,
    decidedOn: permission.decidedOn ?? today,
    representativeName: permission.representativeName ?? '',
    headName: permission.headName ?? '',
  }
}

/** A numbered part of the form, mirroring the paper's sections. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border p-4">
      <legend className="px-1.5 text-sm font-semibold text-brand">{title}</legend>
      {children}
    </fieldset>
  )
}

/**
 * The permission request form (ቅጽ 2 · የፈቃድ መጠየቂያ ፎርም) as the department
 * records it: who and when, the type and period, the member's confirmation,
 * and the department head's decision, with the signed form as evidence.
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
    values: initialValues(permission, departments?.length === 1 ? String(departments[0]!.id) : ''),
    resetOptions: { keepDirtyValues: true },
  })
  const { control, setValue } = form
  const [departmentId, type, weekdays, timed, memberConfirmed, decision] = useWatch({
    control,
    name: ['departmentId', 'type', 'weekdays', 'timed', 'memberConfirmed', 'decision'],
  })
  const { data: candidates, isFetching } = usePermissionCandidates(
    departmentId ? Number(departmentId) : null,
    query,
    open && !permission && member === null,
  )

  const chooseMember = (m: PermissionMember | null) => {
    setMember(m)
    setValue('memberId', m?.id ?? 0, { shouldValidate: m !== null })
    if (m?.phone && !form.getValues('contactPhone')) setValue('contactPhone', m.phone)
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
    const late = v.type === 'LATE_ARRIVAL'
    const decided = v.decision !== 'PENDING'
    try {
      await onSave(
        {
          departmentId: Number(v.departmentId),
          memberId: v.memberId,
          type: v.type,
          typeOther: v.type === 'OTHER' ? v.typeOther : null,
          graceMinutes: late ? Number(v.graceMinutes) : null,
          weekdays: late ? v.weekdays : [0, 1, 2, 3, 4, 5, 6],
          startsOn: v.startsOn,
          endsOn: v.endsOn,
          fromTime: v.timed ? v.fromTime : null,
          toTime: v.timed ? v.toTime : null,
          reason: v.reason,
          requestedOn: v.requestedOn,
          contactPhone: v.contactPhone || null,
          memberConfirmed: v.memberConfirmed,
          memberConfirmedOn: v.memberConfirmed ? v.memberConfirmedOn || null : null,
          decision: v.decision,
          decidedOn: decided ? v.decidedOn || null : null,
          representativeName: v.representativeName || null,
          headName: v.headName || null,
        },
        evidence,
      )
      close(false)
    } catch (error) {
      form.setError('root.server', { message: getErrorMessage(error) })
    }
  })

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {permission ? t('attendance.permissions.editTitle', { code: permission.code }) : t('attendance.permissions.new')}
          </DialogTitle>
          <DialogDescription>{t('attendance.permissions.dialogBody')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
          {/* Who and when — the top of the paper form. */}
          <div className="grid gap-4">
            {(departments?.length ?? 0) > 1 && !permission && (
              <SelectField
                control={control}
                name="departmentId"
                label={t('attendance.permissions.fields.department')}
                required
                options={(departments ?? []).map((d) => ({ value: String(d.id), label: name(d) }))}
              />
            )}
            <Field data-invalid={errors.memberId ? true : undefined}>
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
                    <ul className="grid max-h-48 gap-0.5 overflow-y-auto rounded-lg border p-1">
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
              {errors.memberId?.message && <p className="text-sm text-destructive">{translateMessage(errors.memberId.message)}</p>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={control} name="contactPhone" label={t('attendance.permissions.fields.phone')} type="tel" inputMode="tel" />
              <DateField control={control} name="requestedOn" label={t('attendance.permissions.fields.requestedOn')} required />
            </div>
          </div>

          <Part title={t('attendance.permissions.parts.request')}>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">
                {t('attendance.permissions.fields.type')} <span className="text-destructive">*</span>
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PERMISSION_TYPES.map((value) => (
                  <label
                    key={value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      type === value ? 'border-primary bg-primary/8 font-medium' : 'hover:bg-accent/50',
                    )}
                  >
                    <input
                      type="radio"
                      name="permission-type"
                      className="accent-primary"
                      checked={type === value}
                      onChange={() => setValue('type', value, { shouldValidate: true })}
                    />
                    {t(`attendance.permissions.types.${value}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            {type === 'OTHER' && (
              <TextField control={control} name="typeOther" label={t('attendance.permissions.fields.typeOther')} required />
            )}

            {type === 'LATE_ARRIVAL' && (
              <>
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
                  {errors.weekdays?.message && <p className="text-sm text-destructive">{translateMessage(errors.weekdays.message)}</p>}
                </fieldset>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <DateField control={control} name="startsOn" label={t('attendance.permissions.fields.from')} required />
              <DateField control={control} name="endsOn" label={t('attendance.permissions.fields.to')} required />
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">{t('attendance.permissions.fields.timed')}</span>
                <span className="block text-xs text-muted-foreground">{t('attendance.permissions.fields.timedHint')}</span>
              </span>
              <Switch checked={timed} onCheckedChange={(on) => setValue('timed', on, { shouldValidate: true })} />
            </label>
            {timed && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TimeField control={control} name="fromTime" label={t('attendance.permissions.fields.fromTime')} />
                <TimeField control={control} name="toTime" label={t('attendance.permissions.fields.toTime')} />
              </div>
            )}
            <TextareaField
              control={control}
              name="reason"
              label={t('attendance.permissions.fields.reason')}
              placeholder={t('attendance.permissions.fields.reasonPlaceholder')}
              rows={3}
              required
            />
          </Part>

          <Part title={t('attendance.permissions.parts.member')}>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={memberConfirmed}
                onChange={(e) => setValue('memberConfirmed', e.target.checked)}
              />
              <span>{t('attendance.permissions.fields.memberConfirmed')}</span>
            </label>
            {memberConfirmed && (
              <DateField control={control} name="memberConfirmedOn" label={t('attendance.permissions.fields.memberConfirmedOn')} />
            )}
          </Part>

          <Part title={t('attendance.permissions.parts.decision')}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PERMISSION_DECISIONS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    decision === value ? 'border-primary bg-primary/8 font-medium' : 'hover:bg-accent/50',
                  )}
                >
                  <input
                    type="radio"
                    name="permission-decision"
                    className="accent-primary"
                    checked={decision === value}
                    onChange={() => setValue('decision', value)}
                  />
                  {t(`attendance.permissions.decisions.${value}`)}
                </label>
              ))}
            </div>
            {decision !== 'APPROVED' && (
              <p className="text-xs text-muted-foreground">{t('attendance.permissions.onlyApprovedApply')}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={control} name="representativeName" label={t('attendance.permissions.fields.representative')} />
              <TextField control={control} name="headName" label={t('attendance.permissions.fields.head')} />
            </div>
            {decision !== 'PENDING' && (
              <DateField control={control} name="decidedOn" label={t('attendance.permissions.fields.decidedOn')} />
            )}
          </Part>

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

          {errors.root?.server && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errors.root.server.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={form.formState.isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {permission ? t('common.save') : t('attendance.permissions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
