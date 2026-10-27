import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, SwitchField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { COURSE_DURATIONS, type Course, type CourseInput } from '../types'

const name = (max: number) =>
  z.string().trim().min(1, msg('validation.required')).max(max, msg('validation.tooLong', { max }))
const schema = z.object({
  nameAm: name(150),
  nameEn: name(150),
  duration: z.enum(COURSE_DURATIONS, { message: msg('validation.required') }),
  departmentId: z.string().min(1, msg('validation.required')),
  passMark: z.string().regex(/^(100|[1-9]\d?)$/, msg('courses.validation.passMark')),
  description: z.string().trim().max(1000, msg('validation.tooLong', { max: 1000 })),
  isActive: z.boolean(),
})
type Values = z.infer<typeof schema>

const FIELDS = Object.keys(schema.shape)

/** Register (`course` undefined) or edit a course. */
export function CourseDialog({
  open,
  onOpenChange,
  course,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  course?: Course
  onSave: (input: CourseInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const localized = useLocalizedName()
  // Department admins only get their own departments; with one, it's preselected.
  const { data: departments } = useDepartments()
  const only = departments?.length === 1 ? String(departments[0]!.id) : undefined
  const education = departments?.find((d) => d.code === 'EDUCATION')
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      nameAm: course?.nameAm ?? '',
      nameEn: course?.nameEn ?? '',
      duration: course?.duration ?? ('' as Values['duration']),
      departmentId: course ? String(course.departmentId) : (only ?? (education ? String(education.id) : '')),
      passMark: String(course?.passMark ?? 50),
      description: course?.description ?? '',
      isActive: course?.isActive ?? true,
    },
  })
  const { control } = form

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({
        nameAm: v.nameAm,
        nameEn: v.nameEn,
        duration: v.duration,
        departmentId: Number(v.departmentId),
        passMark: Number(v.passMark),
        description: v.description || null,
        ...(course && { isActive: v.isActive }),
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
          <DialogTitle>{course ? t('courses.edit') : t('courses.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <TextField control={control} name="nameAm" label={t('courses.fields.nameAm')} required />
          <TextField control={control} name="nameEn" label={t('courses.fields.nameEn')} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={control}
              name="duration"
              label={t('courses.fields.duration')}
              description={t('courses.fields.durationHint')}
              required
              options={COURSE_DURATIONS.map((d) => ({ value: d, label: t(`courses.durations.${d}`) }))}
            />
            <TextField
              control={control}
              name="passMark"
              label={t('courses.fields.passMark')}
              description={t('courses.fields.passMarkHint')}
              inputMode="numeric"
              required
            />
          </div>
          <SelectField
            control={control}
            name="departmentId"
            label={t('courses.fields.department')}
            required
            options={(departments ?? []).map((d) => ({ value: String(d.id), label: localized(d) }))}
          />
          <TextareaField control={control} name="description" label={t('courses.fields.description')} rows={3} />
          {course && (
            <SwitchField control={control} name="isActive" label={t('courses.fields.isActive')} description={t('courses.fields.isActiveHint')} />
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
              {course ? t('courses.save') : t('courses.register')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
