import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, SwitchField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { useDepartments } from '@/features/departments/api'
import { mainDepartments } from '@/features/departments/types'
import type {
  ClassAgreement,
  ClassAgreementInput,
  ClassGrade,
  ClassGradeInput,
  ClassType,
  ClassTypeInput,
} from '../types'
import { useLocalizedName } from '../use-localized'

const code = z
  .string()
  .trim()
  .min(1, msg('validation.required'))
  .max(40, msg('validation.tooLong', { max: 40 }))
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z][A-Z0-9_]*$/, msg('validation.codeFormat')))
const name = z.string().trim().min(1, msg('validation.required')).max(100, msg('validation.tooLong', { max: 100 }))
const optional = (max: number) => z.string().trim().max(max, msg('validation.tooLong', { max }))

const typeSchema = z.object({
  code,
  nameEn: name,
  nameAm: name,
  descriptionEn: optional(255),
  descriptionAm: optional(255),
  departmentId: z.string().min(1, msg('validation.required')),
  isActive: z.boolean(),
})
const gradeSchema = z.object({
  code,
  nameEn: name,
  nameAm: name,
  shortLabel: optional(10),
  isActive: z.boolean(),
})

const agreementSchema = z.object({
  titleAm: z.string().trim().min(1, msg('validation.required')).max(200, msg('validation.tooLong', { max: 200 })),
  titleEn: z.string().trim().min(1, msg('validation.required')).max(200, msg('validation.tooLong', { max: 200 })),
  rulesAm: z.string().trim().min(1, msg('validation.required')).max(5000, msg('validation.tooLong', { max: 5000 })),
  rulesEn: z.string().trim().min(1, msg('validation.required')).max(5000, msg('validation.tooLong', { max: 5000 })),
  pledgeAm: optional(2000),
  pledgeEn: optional(2000),
})
type AgreementValues = z.input<typeof agreementSchema>

type TypeValues = z.input<typeof typeSchema>
type GradeValues = z.input<typeof gradeSchema>
const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim())

function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className ?? 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function Footer({ pending, submitLabel, onCancel }: { pending: boolean; submitLabel: string; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </DialogFooter>
  )
}

function RootError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  ) : null
}

/** Create or edit a class type. `type` undefined = create. */
export function ClassTypeDialog({
  open,
  onOpenChange,
  type,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: ClassType
  onSave: (input: ClassTypeInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const localized = useLocalizedName()
  const { data: allDepartments } = useDepartments()
  const departments = mainDepartments(allDepartments ?? [], [type?.departmentId])
  const form = useForm<TypeValues, unknown, z.output<typeof typeSchema>>({
    resolver: zodResolver(typeSchema),
    values: {
      code: type?.code ?? '',
      nameEn: type?.nameEn ?? '',
      nameAm: type?.nameAm ?? '',
      descriptionEn: type?.descriptionEn ?? '',
      descriptionAm: type?.descriptionAm ?? '',
      // Department users only get their own departments; with just one, it's preselected.
      departmentId: type ? String(type.departmentId) : departments.length === 1 ? String(departments[0]!.id) : '',
      isActive: type?.isActive ?? true,
    },
  })
  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({
        ...v,
        descriptionEn: nullIfEmpty(v.descriptionEn),
        descriptionAm: nullIfEmpty(v.descriptionAm),
        departmentId: Number(v.departmentId),
      })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, Object.keys(typeSchema.shape))) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })
  const { control } = form
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={type ? t('classes.editType') : t('classes.newType')}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <TextField
          control={control}
          name="code"
          label={t('classes.fields.code')}
          description={type ? undefined : t('classes.fields.codeHint')}
          required
          disabled={Boolean(type)}
          className="font-mono"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="nameEn" label={t('classes.fields.nameEn')} required />
          <TextField control={control} name="nameAm" label={t('classes.fields.nameAm')} required lang="am" />
        </div>
        <TextareaField control={control} name="descriptionEn" label={t('classes.fields.descriptionEn')} rows={2} />
        <TextareaField control={control} name="descriptionAm" label={t('classes.fields.descriptionAm')} rows={2} lang="am" />
        <SelectField
          control={control}
          name="departmentId"
          label={t('classes.fields.department')}
          description={t('classes.fields.departmentHint')}
          required
          options={departments.map((d) => ({ value: String(d.id), label: localized(d) }))}
        />
        <SwitchField
          control={control}
          name="isActive"
          label={t('classes.fields.isActive')}
          description={t('classes.fields.isActiveHint')}
        />
        <RootError message={form.formState.errors.root?.server?.message} />
        <Footer
          pending={form.formState.isSubmitting}
          submitLabel={type ? t('classes.save') : t('classes.create')}
          onCancel={() => onOpenChange(false)}
        />
      </form>
    </DialogShell>
  )
}

/** Create or edit a grade within `typeName`. `grade` undefined = create. */
export function ClassGradeDialog({
  open,
  onOpenChange,
  typeName,
  grade,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  typeName: string
  grade?: ClassGrade
  onSave: (input: ClassGradeInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const form = useForm<GradeValues, unknown, z.output<typeof gradeSchema>>({
    resolver: zodResolver(gradeSchema),
    values: {
      code: grade?.code ?? '',
      nameEn: grade?.nameEn ?? '',
      nameAm: grade?.nameAm ?? '',
      shortLabel: grade?.shortLabel ?? '',
      isActive: grade?.isActive ?? true,
    },
  })
  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({ ...v, shortLabel: nullIfEmpty(v.shortLabel) })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, Object.keys(gradeSchema.shape))) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })
  const { control } = form
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={grade ? t('classes.editGrade') : t('classes.addGrade')}
      description={typeName}
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={control}
            name="code"
            label={t('classes.fields.code')}
            required
            disabled={Boolean(grade)}
          />
          <TextField
            control={control}
            name="shortLabel"
            label={t('classes.fields.shortLabel')}
            description={t('classes.fields.shortLabelHint')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="nameEn" label={t('classes.fields.nameEn')} required />
          <TextField control={control} name="nameAm" label={t('classes.fields.nameAm')} required lang="am" />
        </div>
        <SwitchField
          control={control}
          name="isActive"
          label={t('classes.fields.isActive')}
          description={t('classes.fields.isActiveHint')}
        />
        <RootError message={form.formState.errors.root?.server?.message} />
        <Footer
          pending={form.formState.isSubmitting}
          submitLabel={grade ? t('classes.save') : t('classes.create')}
          onCancel={() => onOpenChange(false)}
        />
      </form>
    </DialogShell>
  )
}

/**
 * The agreement members of `typeName` accept (e.g. the Mezmur class's code of
 * conduct). The bot shows it to people who pick a level in this class.
 * `agreement` undefined = this class has none yet.
 */
export function ClassAgreementDialog({
  open,
  onOpenChange,
  typeName,
  agreement,
  onSave,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  typeName: string
  agreement?: ClassAgreement | null
  onSave: (input: ClassAgreementInput) => Promise<void>
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const form = useForm<AgreementValues, unknown, z.output<typeof agreementSchema>>({
    resolver: zodResolver(agreementSchema),
    values: {
      titleAm: agreement?.titleAm ?? '',
      titleEn: agreement?.titleEn ?? '',
      rulesAm: agreement?.rulesAm ?? '',
      rulesEn: agreement?.rulesEn ?? '',
      pledgeAm: agreement?.pledgeAm ?? '',
      pledgeEn: agreement?.pledgeEn ?? '',
    },
  })
  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({ ...v, pledgeAm: nullIfEmpty(v.pledgeAm), pledgeEn: nullIfEmpty(v.pledgeEn) })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, Object.keys(agreementSchema.shape))) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })
  const { control } = form
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('classes.agreement.dialogTitle', { name: typeName })}
      description={t('classes.agreement.dialogDescription')}
      className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="titleAm" label={t('classes.agreement.titleAm')} required lang="am" />
          <TextField control={control} name="titleEn" label={t('classes.agreement.titleEn')} required />
          <TextareaField
            control={control}
            name="rulesAm"
            label={t('classes.agreement.rulesAm')}
            description={t('classes.agreement.rulesHint')}
            required
            rows={8}
            lang="am"
          />
          <TextareaField
            control={control}
            name="rulesEn"
            label={t('classes.agreement.rulesEn')}
            description={t('classes.agreement.rulesHint')}
            required
            rows={8}
          />
          <TextareaField
            control={control}
            name="pledgeAm"
            label={t('classes.agreement.pledgeAm')}
            description={t('classes.agreement.pledgeHint')}
            rows={3}
            lang="am"
          />
          <TextareaField
            control={control}
            name="pledgeEn"
            label={t('classes.agreement.pledgeEn')}
            description={t('classes.agreement.pledgeHint')}
            rows={3}
          />
        </div>
        <RootError message={form.formState.errors.root?.server?.message} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {agreement && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive sm:mr-auto"
              onClick={onRemove}
              disabled={form.formState.isSubmitting}
            >
              {t('classes.agreement.remove')}
            </Button>
          )}
          <Footer
            pending={form.formState.isSubmitting}
            submitLabel={t('classes.save')}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </form>
    </DialogShell>
  )
}
