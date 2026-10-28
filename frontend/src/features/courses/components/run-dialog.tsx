import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextareaField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClassTypes } from '@/features/classes/api'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { msg, translateMessage } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { todayIso } from '@/lib/ethiopian-calendar'
import { formatDate } from '@/lib/format'
import { useTeachers } from '../api'
import { type Course, type CourseRun, DURATION_DAYS, type RunInput } from '../types'

const schema = z
  .object({
    classGradeId: z.string().min(1, msg('validation.required')),
    startDate: z.string().min(1, msg('validation.required')),
    endDate: z.string().min(1, msg('validation.required')),
    teacherIds: z.array(z.number()).min(1, msg('courses.chooseTeacher')),
    notes: z.string().trim().max(1000, msg('validation.tooLong', { max: 1000 })),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: msg('courses.endBeforeStart') })
type Values = z.infer<typeof schema>

const FIELDS = ['classGradeId', 'startDate', 'endDate', 'teacherIds', 'notes']

/** Last day of a run of `course` starting on `start` (inclusive). */
function endFor(start: string, course: Pick<Course, 'duration'>): string {
  const d = new Date(`${start}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + DURATION_DAYS[course.duration] - 1)
  return d.toISOString().slice(0, 10)
}

/** Schedule (`run` undefined) or edit a run of a course: grade, period and teachers. */
export function RunDialog({
  open,
  onOpenChange,
  course,
  run,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  course: Pick<Course, 'id' | 'duration' | 'nameAm' | 'nameEn' | 'departmentId'>
  run?: CourseRun
  onSave: (input: RunInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { data: classTypes } = useClassTypes()
  const { data: teachers } = useTeachers(open)
  const start = todayIso()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      classGradeId: run ? String(run.classGradeId) : '',
      startDate: run?.startDate.slice(0, 10) ?? start,
      endDate: run?.endDate.slice(0, 10) ?? endFor(start, course),
      teacherIds: run?.teachers.map((x) => x.id) ?? [],
      notes: run?.notes ?? '',
    },
  })
  const { control, setValue } = form
  const [startDate, endDate, teacherIds] = useWatch({ control, name: ['startDate', 'endDate', 'teacherIds'] })
  const suggestedEnd = startDate ? endFor(startDate, course) : ''
  // A new run's end follows its start, until the end is picked by hand.
  useEffect(() => {
    if (!run && suggestedEnd && !form.getFieldState('endDate').isDirty) setValue('endDate', suggestedEnd)
  }, [run, suggestedEnd, form, setValue])
  const teacherError = form.formState.errors.teacherIds?.message

  // Only the classes the course's department runs (a run keeps the grade it already has).
  const grades = (classTypes ?? [])
    .filter((ct) => ct.departmentId === course.departmentId || ct.grades.some((g) => g.id === run?.classGradeId))
    .flatMap((ct) =>
    ct.grades.filter((g) => g.isActive || g.id === run?.classGradeId).map((g) => ({
      value: String(g.id),
      label: `${name(ct)} · ${name(g)}`,
    })),
  )

  const toggle = (id: number) =>
    setValue('teacherIds', teacherIds.includes(id) ? teacherIds.filter((x) => x !== id) : [...teacherIds, id], {
      shouldValidate: form.formState.isSubmitted,
    })

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({
        courseId: course.id,
        classGradeId: Number(v.classGradeId),
        startDate: v.startDate,
        endDate: v.endDate,
        teacherIds: v.teacherIds,
        notes: v.notes || null,
      })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, FIELDS)) form.setError('root.server', { message: getErrorMessage(error) })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{run ? t('courses.runs.edit') : t('courses.runs.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <p className="-mt-2 text-sm text-muted-foreground">
            {name(course)} · {t(`courses.durations.${course.duration}`)}
          </p>
          <SelectField
            control={control}
            name="classGradeId"
            label={t('courses.runs.grade')}
            description={grades.length === 0 && classTypes ? t('courses.runs.noGrades') : t('courses.runs.gradeHint')}
            required
            options={grades}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              control={control}
              name="startDate"
              label={t('courses.runs.startDate')}
              required
            />
            <DateField
              control={control}
              name="endDate"
              label={t('courses.runs.endDate')}
              description={t('courses.runs.endHint')}
              required
            />
          </div>
          {suggestedEnd && suggestedEnd !== endDate && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="-mt-2 h-auto justify-self-start p-0 text-xs"
              onClick={() => setValue('endDate', suggestedEnd, { shouldValidate: true })}
            >
              {t('courses.runs.useDuration', { date: formatDate(suggestedEnd) })}
            </Button>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('courses.runs.teachers')} <span className="text-destructive">*</span>
            </legend>
            {teachers?.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">{t('courses.runs.noTeachers')}</p>
            ) : (
              <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {(teachers ?? []).map((teacher) => (
                  <label key={teacher.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={teacherIds.includes(teacher.id)}
                      onChange={() => toggle(teacher.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{teacher.member ? memberFullName(teacher.member) : teacher.fullName}</span>
                      {teacher.member && (
                        <span className="block font-mono text-xs text-muted-foreground">{teacher.member.memberCode}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {teacherError && (
              <p role="alert" className="text-sm text-destructive">
                {translateMessage(teacherError)}
              </p>
            )}
          </fieldset>
          <TextareaField control={control} name="notes" label={t('courses.runs.notes')} rows={2} />
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
              {run ? t('courses.save') : t('courses.runs.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
