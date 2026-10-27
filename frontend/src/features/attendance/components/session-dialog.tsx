import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextareaField, TextField, TimeField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { useAuth } from '@/features/auth/use-auth'
import { useDepartments } from '@/features/departments/api'
import { useServiceGroups, useServiceTerms } from '@/features/service-groups/api'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { todayIso } from '@/lib/ethiopian-calendar'
import { PERMISSIONS } from '@/lib/permissions'
import { addisDate, addisTime } from '../time'
import { type AttendanceSession, SESSION_KINDS, type SessionInput } from '../types'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const schema = z
  .object({
    kind: z.enum(SESSION_KINDS),
    title: z.string().trim().min(1, msg('validation.required')).max(150, msg('validation.tooLong', { max: 150 })),
    date: z.string().min(1, msg('validation.required')),
    startTime: z.string().regex(TIME, msg('validation.required')),
    endTime: z.string().regex(TIME, msg('validation.required')),
    lateAfterMinutes: z.string().regex(/^\d{1,3}$/, msg('validation.required')),
    classTypeId: z.string(),
    classGradeId: z.string(),
    departmentId: z.string(),
    serviceGroupId: z.string(),
    organiserId: z.string(),
    location: z.string().trim().max(150, msg('validation.tooLong', { max: 150 })),
    notes: z.string().trim().max(2000, msg('validation.tooLong', { max: 2000 })),
  })
  .refine((v) => v.kind !== 'CLASS' || v.classTypeId !== '', { path: ['classTypeId'], message: msg('validation.required') })
  // A chosen class type needs its grade (for CLASS always; for OTHER only when a type was picked).
  .refine((v) => v.kind === 'SERVICE_GROUP' || v.classTypeId === '' || v.classGradeId !== '', {
    path: ['classGradeId'],
    message: msg('validation.required'),
  })
  .refine((v) => v.kind !== 'SERVICE_GROUP' || v.serviceGroupId !== '', { path: ['serviceGroupId'], message: msg('validation.required') })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: msg('validation.date') })
type Values = z.infer<typeof schema>

const FIELDS = ['kind', 'title', 'date', 'startTime', 'endTime', 'lateAfterMinutes', 'classGradeId', 'departmentId', 'serviceGroupId', 'organiserId', 'location', 'notes']

function initialValues(session?: AttendanceSession): Values {
  if (!session) {
    return {
      kind: 'CLASS', title: '', date: todayIso(), startTime: '08:00', endTime: '11:00', lateAfterMinutes: '15',
      classTypeId: '', classGradeId: '', departmentId: '', serviceGroupId: '', organiserId: '', location: '', notes: '',
    }
  }
  return {
    kind: session.kind,
    title: session.title,
    date: addisDate(session.startsAt),
    startTime: addisTime(session.startsAt),
    endTime: addisTime(session.endsAt),
    lateAfterMinutes: String(session.lateAfterMinutes),
    classTypeId: session.classGrade ? String(session.classGrade.classType.id) : '',
    classGradeId: session.classGradeId ? String(session.classGradeId) : '',
    departmentId: session.departmentId ? String(session.departmentId) : '',
    serviceGroupId: session.serviceGroupId ? String(session.serviceGroupId) : '',
    organiserId: session.organiserId ? String(session.organiserId) : '',
    location: session.location ?? '',
    notes: session.notes ?? '',
  }
}

/** Create (`session` undefined) or edit an attendance session. */
export function SessionDialog({
  open,
  onOpenChange,
  session,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  session?: AttendanceSession
  onSave: (input: SessionInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const { data: classTypes } = useClassTypes()
  const { data: departments } = useDepartments()
  const { data: terms } = useServiceTerms()
  // Editing keeps the session's own term; new sessions use the current term's groups.
  const termId = session?.serviceGroup?.term.id ?? terms?.find((x) => x.isCurrent)?.id
  const { data: serviceGroups } = useServiceGroups(termId)
  const form = useForm<Values>({ resolver: zodResolver(schema), values: initialValues(session) })
  const { control, setValue, getFieldState } = form
  const [kind, classTypeId, classGradeId, serviceGroupId] = useWatch({
    control,
    name: ['kind', 'classTypeId', 'classGradeId', 'serviceGroupId'],
  })

  // Department-scoped users only see the classes, groups and organisers of their own departments.
  const { user, can, inDepartment } = useAuth()
  // Attendance takers work on today's sessions only; other days are for department admins.
  const anyDay = can(PERMISSIONS.ATTENDANCE_ANY_DAY)
  const scoped = user?.departmentIds != null
  const activeTypes = (classTypes ?? []).filter(
    (type) => (type.isActive || String(type.id) === classTypeId) && inDepartment(type.departmentId),
  )
  const typeOptions = activeTypes.map((type) => ({ value: String(type.id), label: name(type) }))
  const selectedType = activeTypes.find((type) => String(type.id) === classTypeId)
  const gradeOptions = (selectedType?.grades ?? [])
    .filter((g) => g.isActive || String(g.id) === classGradeId)
    .map((g) => ({ value: String(g.id), label: gradeLabel(g) }))
  const departmentOptions = (departments ?? []).map((d) => ({ value: String(d.id), label: name(d) }))
  const typeDepartment = new Map((classTypes ?? []).map((type) => [type.id, type.departmentId]))
  const organiserOptions = (departments ?? [])
    .filter((d) => inDepartment(d.id))
    .map((d) => ({ value: String(d.id), label: name(d) }))
  const groupOptions = (serviceGroups ?? [])
    .filter((g) => inDepartment(g.classGrade ? typeDepartment.get(g.classGrade.classType.id) : null))
    .map((g) => ({
    value: String(g.id),
    label: `${name(g)} · ${t('serviceGroups.memberCount', { count: g.members.length })}`,
  }))

  // A grade belongs to one class type: changing the type clears a grade from another type.
  useEffect(() => {
    if (classGradeId && selectedType && !selectedType.grades.some((g) => String(g.id) === classGradeId)) {
      setValue('classGradeId', '')
    }
    if (!classTypeId && classGradeId) setValue('classGradeId', '')
  }, [classTypeId, classGradeId, selectedType, setValue])

  // Suggest a title from the audience until the user types their own.
  useEffect(() => {
    if (session || getFieldState('title').isDirty) return
    const grade = selectedType?.grades.find((g) => String(g.id) === classGradeId)
    const group = serviceGroups?.find((g) => String(g.id) === serviceGroupId)
    const suggestion =
      kind === 'CLASS' && selectedType && grade
        ? `${name(selectedType)} · ${gradeLabel(grade)}`
        : kind === 'SERVICE_GROUP' && group
          ? `${t('attendance.kinds.SERVICE_GROUP')} · ${name(group)}`
          : t(`attendance.kinds.${kind}`)
    setValue('title', suggestion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, classTypeId, classGradeId, serviceGroupId, classTypes, serviceGroups])

  // A user of a single department organises "Other" sessions for it without being asked.
  useEffect(() => {
    if (!session && scoped && organiserOptions.length === 1 && !form.getValues('organiserId')) {
      setValue('organiserId', organiserOptions[0]!.value)
    }
  }, [session, scoped, organiserOptions, form, setValue])

  const submit = form.handleSubmit(async (v) => {
    const isGroup = v.kind === 'SERVICE_GROUP'
    try {
      await onSave({
        kind: v.kind,
        title: v.title,
        date: v.date,
        startTime: v.startTime,
        endTime: v.endTime,
        lateAfterMinutes: Number(v.lateAfterMinutes),
        classGradeId: !isGroup && v.classGradeId ? Number(v.classGradeId) : null,
        departmentId: v.kind === 'OTHER' && v.departmentId ? Number(v.departmentId) : null,
        serviceGroupId: isGroup && v.serviceGroupId ? Number(v.serviceGroupId) : null,
        organiserId: v.kind === 'OTHER' && v.organiserId ? Number(v.organiserId) : null,
        location: v.location || null,
        notes: v.notes || null,
      })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, FIELDS)) form.setError('root.server', { message: getErrorMessage(error) })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{session ? t('attendance.editSession') : t('attendance.newSession')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <SelectField
            control={control}
            name="kind"
            label={t('attendance.fields.kind')}
            description={t(`attendance.kindHints.${kind}`)}
            required
            options={SESSION_KINDS.map((k) => ({ value: k, label: t(`attendance.kinds.${k}`) }))}
          />
          {kind === 'SERVICE_GROUP' ? (
            <SelectField
              control={control}
              name="serviceGroupId"
              label={t('attendance.fields.serviceGroup')}
              description={groupOptions.length === 0 ? t('attendance.fields.noServiceGroups') : undefined}
              required
              options={groupOptions}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={control}
                name="classTypeId"
                label={t('attendance.fields.classType')}
                required={kind === 'CLASS'}
                options={typeOptions}
                allowEmpty={kind === 'OTHER'}
                emptyLabel={t('attendance.fields.anyClassType')}
              />
              {classTypeId && (
                <SelectField
                  control={control}
                  name="classGradeId"
                  label={t('attendance.fields.classGrade')}
                  required
                  options={gradeOptions}
                />
              )}
            </div>
          )}
          {kind === 'OTHER' && (
            <SelectField
              control={control}
              name="organiserId"
              label={t('attendance.fields.organiser')}
              description={t('attendance.fields.organiserHint')}
              required={scoped}
              options={organiserOptions}
              allowEmpty={!scoped}
              emptyLabel={t('attendance.fields.office')}
            />
          )}
          {kind === 'OTHER' && (
            <SelectField
              control={control}
              name="departmentId"
              label={t('attendance.fields.department')}
              options={departmentOptions}
              allowEmpty
              emptyLabel={t('attendance.fields.anyDepartment')}
            />
          )}
          <TextField control={control} name="title" label={t('attendance.fields.title')} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              control={control}
              name="date"
              label={t('attendance.fields.date')}
              description={anyDay ? undefined : t('attendance.fields.todayOnly')}
              required
              disabled={!anyDay}
              className="sm:col-span-2"
            />
            <TimeField control={control} name="startTime" label={t('attendance.fields.startTime')} required />
            <TimeField control={control} name="endTime" label={t('attendance.fields.endTime')} required />
            {kind !== 'OTHER' && (
              <TextField
                control={control}
                name="lateAfterMinutes"
                label={t('attendance.fields.lateAfter')}
                type="number"
                inputMode="numeric"
                min={0}
                max={240}
              />
            )}
          </div>
          {kind !== 'OTHER' && <p className="-mt-2 text-xs text-muted-foreground">{t('attendance.fields.lateAfterHint')}</p>}
          <TextField control={control} name="location" label={t('attendance.fields.location')} />
          <TextareaField control={control} name="notes" label={t('attendance.fields.notes')} rows={2} />
          {form.formState.errors.root?.server && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {form.formState.errors.root.server.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {session ? t('attendance.save') : t('attendance.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
