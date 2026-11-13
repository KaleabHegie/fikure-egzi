import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClock, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { type Control, useController, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, SwitchField, TextField, TimeField } from '@/components/form/form-fields'
import { FieldError } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { useAuth } from '@/features/auth/use-auth'
import { useDepartments } from '@/features/departments/api'
import { departmentOptions as departmentOptions_, mainDepartments } from '@/features/departments/types'
import { useServiceGroups, useServiceTerms } from '@/features/service-groups/api'
import type { ServiceGroup } from '@/features/service-groups/types'
import { msg, translateMessage } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { formatEth, todayIso } from '@/lib/ethiopian-calendar'
import { formatDate, formatTime } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
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
    absentAfterMinutes: z.string().regex(/^\d{0,3}$/, msg('validation.required')),
    classTypeId: z.string(),
    classGradeId: z.string(),
    departmentId: z.string(),
    /** SERVICE_GROUP: one or more groups of the same grade; the first is the session's own. */
    serviceGroupIds: z.array(z.string()),
    organiserId: z.string(),
    /** ልብሰ ስብሐት is handed out at this session. */
    vestments: z.boolean(),
  })
  .refine((v) => v.kind !== 'CLASS' || v.classTypeId !== '', { path: ['classTypeId'], message: msg('validation.required') })
  // A chosen class type needs its grade (for CLASS always; for OTHER only when a type was picked).
  .refine((v) => v.kind === 'SERVICE_GROUP' || v.classTypeId === '' || v.classGradeId !== '', {
    path: ['classGradeId'],
    message: msg('validation.required'),
  })
  .refine((v) => v.kind !== 'SERVICE_GROUP' || v.serviceGroupIds.length > 0, { path: ['serviceGroupIds'], message: msg('validation.required') })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: msg('validation.date') })
  .refine((v) => v.kind === 'OTHER' || v.absentAfterMinutes === '' || Number(v.absentAfterMinutes) > Number(v.lateAfterMinutes), {
    path: ['absentAfterMinutes'],
    message: msg('attendance.absentAfterLate'),
  })
type Values = z.infer<typeof schema>

const FIELDS = ['kind', 'title', 'date', 'startTime', 'endTime', 'lateAfterMinutes', 'absentAfterMinutes', 'classGradeId', 'departmentId', 'serviceGroupIds', 'organiserId']
// The API reports group problems on the main group.
const FIELD_ALIASES: Record<string, string> = { serviceGroupId: 'serviceGroupIds', extraServiceGroupIds: 'serviceGroupIds' }

/** The class or groups a user last took attendance for, offered again next time (this browser only). */
type Remembered = Pick<Values, 'kind' | 'classTypeId' | 'classGradeId' | 'serviceGroupIds'>
const rememberKey = (userId: number | undefined) => `fe.attendance.lastAudience.${userId ?? 0}`

function remembered(userId: number | undefined): Partial<Remembered> {
  try {
    const raw = JSON.parse(localStorage.getItem(rememberKey(userId)) ?? 'null') as Partial<Remembered> | null
    if (!raw || !(SESSION_KINDS as readonly string[]).includes(raw.kind ?? '')) return {}
    return {
      kind: raw.kind,
      classTypeId: typeof raw.classTypeId === 'string' ? raw.classTypeId : '',
      classGradeId: typeof raw.classGradeId === 'string' ? raw.classGradeId : '',
      serviceGroupIds: Array.isArray(raw.serviceGroupIds) ? raw.serviceGroupIds.filter((x) => typeof x === 'string') : [],
    }
  } catch {
    return {}
  }
}

function remember(userId: number | undefined, v: Values) {
  try {
    const value: Remembered = { kind: v.kind, classTypeId: v.classTypeId, classGradeId: v.classGradeId, serviceGroupIds: v.serviceGroupIds }
    localStorage.setItem(rememberKey(userId), JSON.stringify(value))
  } catch {
    // Private mode or storage off: nothing to remember, no harm done.
  }
}

function initialValues(session?: AttendanceSession, userId?: number): Values {
  if (!session) {
    return {
      // ቀን 12:00 – ማታ 2:00 (18:00–20:00); late after 15 minutes, absent after 30.
      kind: 'CLASS', title: '', date: todayIso(), startTime: '18:00', endTime: '20:00', lateAfterMinutes: '15', absentAfterMinutes: '30',
      classTypeId: '', classGradeId: '', departmentId: '', serviceGroupIds: [], organiserId: '', vestments: true,
      ...remembered(userId),
    }
  }
  return {
    kind: session.kind,
    title: session.title,
    date: addisDate(session.startsAt),
    startTime: addisTime(session.startsAt),
    endTime: addisTime(session.endsAt),
    lateAfterMinutes: String(session.lateAfterMinutes),
    absentAfterMinutes: session.absentAfterMinutes === null ? '' : String(session.absentAfterMinutes),
    classTypeId: session.classGrade ? String(session.classGrade.classType.id) : '',
    classGradeId: session.classGradeId ? String(session.classGradeId) : '',
    departmentId: session.departmentId ? String(session.departmentId) : '',
    serviceGroupIds: session.serviceGroupId
      ? [session.serviceGroupId, ...(session.extraServiceGroupIds ?? [])].map(String)
      : [],
    organiserId: session.organiserId ? String(session.organiserId) : '',
    vestments: session.vestments,
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
  const { user, can, inDepartment } = useAuth()
  const [initial] = useState(() => initialValues(session, user?.id))
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial })
  const { control, setValue } = form
  const errors = form.formState.errors
  // Date, times and thresholds rarely change: one summary row, opened on demand or on an error.
  const [showTiming, setShowTiming] = useState(false)
  const timingOpen =
    showTiming || Boolean(errors.date || errors.startTime || errors.endTime || errors.lateAfterMinutes || errors.absentAfterMinutes)
  const [kind, classTypeId, classGradeId, date, startTime, endTime, lateAfterMinutes, absentAfterMinutes, serviceGroupIds] = useWatch({
    control,
    name: ['kind', 'classTypeId', 'classGradeId', 'date', 'startTime', 'endTime', 'lateAfterMinutes', 'absentAfterMinutes', 'serviceGroupIds'],
  })

  // Department-scoped users only see the classes, groups and organisers of their own departments.
  // Attendance takers work on today's sessions only; other days are for department admins.
  const anyDay = can(PERMISSIONS.ATTENDANCE_ANY_DAY)
  const scoped = user?.departmentIds != null
  const activeTypes = (classTypes ?? []).filter(
    (type) => (type.isActive || String(type.id) === classTypeId) && inDepartment(type.departmentId),
  )
  const typeOptions = activeTypes.map((type) => ({ value: String(type.id), label: name(type) }))
  const selectedType = activeTypes.find((type) => String(type.id) === classTypeId)
  // ልብሰ ስብሐት: on for Mezmur class, service-group and other sessions, off for the Course class,
  // until the user sets it themselves.
  const vestmentsDefault = kind !== 'CLASS' || selectedType?.code === 'MEZMUR'
  useEffect(() => {
    if (session || form.getFieldState('vestments').isDirty) return
    setValue('vestments', vestmentsDefault)
  }, [session, vestmentsDefault, form, setValue])
  const gradeOptions = (selectedType?.grades ?? [])
    .filter((g) => g.isActive || String(g.id) === classGradeId)
    .map((g) => ({ value: String(g.id), label: gradeLabel(g) }))
  // Main departments only; a session's current department stays listed.
  const mainList = mainDepartments(departments ?? [], [session?.departmentId, session?.organiserId])
  const departmentOptions = departmentOptions_(mainList, name)
  const typeDepartment = new Map((classTypes ?? []).map((type) => [type.id, type.departmentId]))
  const organiserOptions = departmentOptions_(
    mainList.filter((d) => inDepartment(d.id)),
    name,
  )
  const visibleGroups = (serviceGroups ?? []).filter((g) =>
    inDepartment(g.classGrade ? typeDepartment.get(g.classGrade.classType.id) : null),
  )

  // A grade belongs to one class type: changing the type clears a grade from another type.
  useEffect(() => {
    if (classGradeId && selectedType && !selectedType.grades.some((g) => String(g.id) === classGradeId)) {
      setValue('classGradeId', '')
    }
    if (!classTypeId && classGradeId) setValue('classGradeId', '')
  }, [classTypeId, classGradeId, selectedType, setValue])

  // New sessions: drop a remembered class or group that's no longer offered, and pick
  // the only class, level or group there is, so the form is ready to create.
  useEffect(() => {
    if (session || !classTypes) return
    if (classTypeId && !typeOptions.some((o) => o.value === classTypeId)) setValue('classTypeId', '')
    else if (kind === 'CLASS' && !classTypeId && typeOptions.length === 1) setValue('classTypeId', typeOptions[0]!.value)
    else if (kind === 'CLASS' && classTypeId && !classGradeId && gradeOptions.length === 1) setValue('classGradeId', gradeOptions[0]!.value)
  }, [session, classTypes, kind, classTypeId, classGradeId, typeOptions, gradeOptions, setValue])
  useEffect(() => {
    if (session || !serviceGroups) return
    const offered = new Set(visibleGroups.map((g) => String(g.id)))
    const kept = serviceGroupIds.filter((id) => offered.has(id))
    if (kept.length !== serviceGroupIds.length) setValue('serviceGroupIds', kept)
    else if (kind === 'SERVICE_GROUP' && kept.length === 0 && visibleGroups.length === 1) setValue('serviceGroupIds', [String(visibleGroups[0]!.id)])
  }, [session, serviceGroups, kind, serviceGroupIds, visibleGroups, setValue])

  // The title (in Amharic) follows every change of type, class, level and date:
  // a class gets "<date> <level> አቴንዳንስ"; a service group gets the date and
  // keeps whatever the user wrote after it; "Other" starts empty.
  const lastAuto = useRef<string | null>(null)
  const lastKind = useRef(kind)
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    const day = date ? formatEth(date, 'date', 'am') : ''
    const grade = selectedType?.grades.find((g) => String(g.id) === classGradeId)
    const suggestion =
      kind === 'CLASS' ? (grade ? `${day} ${grade.nameAm} አቴንዳንስ` : '') : kind === 'SERVICE_GROUP' ? day && `${day} ` : ''
    // Only a real change of type, level or date moves the title (not the class list loading).
    const key = `${kind}|${classGradeId}|${date}`
    if (kind === 'CLASS' && classGradeId && !grade) return
    if (key === lastKey.current) return
    // Opening an existing session: remember its date part, change nothing yet.
    if (lastAuto.current === null) {
      lastKey.current = key
      lastAuto.current = suggestion
      lastKind.current = kind
      if (session) return
    }
    lastKey.current = key
    const current = form.getValues('title')
    // The user's own words after the date part survive a date change (not a type change).
    const own =
      kind === lastKind.current && lastAuto.current && current.startsWith(lastAuto.current)
        ? current.slice(lastAuto.current.length)
        : kind === lastKind.current && kind !== 'CLASS' && !lastAuto.current
          ? current
          : ''
    lastAuto.current = suggestion
    lastKind.current = kind
    setValue('title', kind === 'CLASS' ? suggestion : suggestion + own, { shouldValidate: form.formState.isSubmitted })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, classTypeId, classGradeId, date, classTypes])

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
        absentAfterMinutes: v.kind !== 'OTHER' && v.absentAfterMinutes !== '' ? Number(v.absentAfterMinutes) : null,
        classGradeId: !isGroup && v.classGradeId ? Number(v.classGradeId) : null,
        departmentId: v.kind === 'OTHER' && v.departmentId ? Number(v.departmentId) : null,
        serviceGroupId: isGroup && v.serviceGroupIds[0] ? Number(v.serviceGroupIds[0]) : null,
        extraServiceGroupIds: isGroup ? v.serviceGroupIds.slice(1).map(Number) : null,
        organiserId: v.kind === 'OTHER' && v.organiserId ? Number(v.organiserId) : null,
        vestments: v.vestments,
      })
      if (!session) remember(user?.id, v)
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, FIELDS, FIELD_ALIASES)) form.setError('root.server', { message: getErrorMessage(error) })
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
            <GroupPicker control={control} groups={visibleGroups} />
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
          <SwitchField
            control={control}
            name="vestments"
            label={t('attendance.vestments.field')}
            description={t('attendance.vestments.fieldHint')}
          />
          {!timingOpen ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">
                  {formatDate(date)} · {formatTime(startTime)} – {formatTime(endTime)}
                </div>
                {kind !== 'OTHER' && (
                  <div className="text-xs text-muted-foreground">
                    {t('attendance.thresholds.late', { minutes: lateAfterMinutes })}
                    {absentAfterMinutes && <> · {t('attendance.thresholds.absent', { minutes: absentAfterMinutes })}</>}
                  </div>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowTiming(true)}>
                {t('attendance.fields.changeTiming')}
              </Button>
            </div>
          ) : (
          <>
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
            {kind !== 'OTHER' && (
              <TextField
                control={control}
                name="absentAfterMinutes"
                label={t('attendance.fields.absentAfter')}
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                placeholder={t('attendance.fields.absentAfterPlaceholder')}
              />
            )}
          </div>
          {kind !== 'OTHER' && <p className="-mt-2 text-xs text-muted-foreground">{t('attendance.fields.lateAfterHint')} {t('attendance.fields.absentAfterHint')}</p>}
          </>
          )}
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

/**
 * Service groups to take attendance for together. Groups are listed by grade;
 * once one is ticked, only groups of that same grade can be added.
 */
function GroupPicker({ control, groups }: { control: Control<Values>; groups: ServiceGroup[] }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name: 'serviceGroupIds' })
  const selected = value
  const gradeOf = (g: ServiceGroup) => g.classGradeId ?? 0
  const lockedGrade = groups.find((g) => String(g.id) === selected[0])
  const byGrade = new Map<number, ServiceGroup[]>()
  for (const g of groups) byGrade.set(gradeOf(g), [...(byGrade.get(gradeOf(g)) ?? []), g])
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="grid gap-2" data-invalid={fieldState.invalid || undefined}>
      <span className="text-sm font-medium">
        {t('attendance.fields.serviceGroups')}
        <span className="ml-0.5 text-destructive">*</span>
      </span>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('attendance.fields.noServiceGroups')}</p>
      ) : (
        <div className="grid max-h-64 gap-3 overflow-y-auto rounded-md border p-3">
          {[...byGrade.entries()].map(([gradeId, list]) => {
            const grade = list[0]!.classGrade
            const disabled = lockedGrade !== undefined && gradeOf(lockedGrade) !== gradeId
            return (
              <div key={gradeId} className={cn('grid gap-1.5', disabled && 'opacity-45')}>
                <span className="text-xs font-semibold text-muted-foreground">
                  {grade ? `${name(grade.classType)} · ${gradeLabel(grade)}` : t('attendance.fields.noGrade')}
                </span>
                {list.map((g) => (
                  <label key={g.id} className={cn('flex items-center gap-2 text-sm', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.includes(String(g.id))}
                      disabled={disabled}
                      onChange={() => toggle(String(g.id))}
                    />
                    <span>{name(g)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('serviceGroups.memberCount', { count: g.members.length })}
                    </span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('attendance.fields.serviceGroupsHint')}</p>
      {fieldState.error?.message && <FieldError>{translateMessage(fieldState.error.message)}</FieldError>}
    </div>
  )
}
