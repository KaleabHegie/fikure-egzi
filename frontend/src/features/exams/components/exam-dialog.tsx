import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { msg } from '@/i18n'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import type { Exam, ExamInput, ExamPartInput } from '../types'
import { blankPart, type PartRow, partsProblem, toPartInputs } from '../parts'
import { PartsEditor } from './parts-editor'

const schema = z.object({
  nameAm: z.string().trim().min(1, msg('validation.required')).max(150, msg('validation.tooLong', { max: 150 })),
  nameEn: z.string().trim().max(150, msg('validation.tooLong', { max: 150 })),
  classTypeId: z.string().min(1, msg('validation.required')),
  /** '' = the whole class. */
  classGradeId: z.string(),
  heldOn: z.string(),
  passMark: z
    .string()
    .regex(/^\d{1,3}$/, msg('exams.passMarkInvalid'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 100, msg('exams.passMarkInvalid')),
  description: z.string().trim().max(1000, msg('validation.tooLong', { max: 1000 })),
})
type Values = z.input<typeof schema>

/** Create an exam (with its parts) or edit its details. `exam` undefined = create. */
export function ExamDialog({
  open,
  onOpenChange,
  exam,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exam?: Exam
  onSave: (input: ExamInput, parts: ExamPartInput[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  // Department admins only get the classes their departments run.
  const { data: classTypes } = useClassTypes()
  const [parts, setParts] = useState<PartRow[]>(() => [blankPart(), blankPart()])
  const [partsError, setPartsError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      nameAm: exam?.nameAm ?? '',
      nameEn: exam?.nameEn ?? '',
      // With a single class to choose from, it's preselected.
      classTypeId: exam ? String(exam.classTypeId) : classTypes?.length === 1 ? String(classTypes[0]!.id) : '',
      classGradeId: exam?.classGradeId ? String(exam.classGradeId) : '',
      heldOn: exam?.heldOn?.slice(0, 10) ?? '',
      passMark: String(exam?.passMark ?? 50),
      description: exam?.description ?? '',
    },
  })

  const submit = form.handleSubmit(async (v) => {
    setPartsError(null)
    if (!exam) {
      const problem = partsProblem(parts)
      if (problem) return setPartsError(t(problem.key as 'exams.duplicatePart', problem.params))
    }
    try {
      await onSave(
        {
          nameAm: v.nameAm,
          nameEn: v.nameEn.trim() || null,
          classTypeId: Number(v.classTypeId),
          // A level from another class (after switching classes) means the whole new class.
          classGradeId:
            v.classGradeId && chosenClass?.grades.some((g) => String(g.id) === v.classGradeId)
              ? Number(v.classGradeId)
              : null,
          heldOn: v.heldOn || null,
          passMark: Number(v.passMark),
          description: v.description.trim() || null,
        },
        exam ? [] : toPartInputs(parts),
      )
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, Object.keys(schema.shape))) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })
  const { control } = form
  const chosenClassId = useWatch({ control, name: 'classTypeId' })
  const chosenClass = classTypes?.find((c) => String(c.id) === chosenClassId)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o && !exam) setParts([blankPart(), blankPart()])
        setPartsError(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{exam ? t('exams.edit') : t('exams.new')}</DialogTitle>
          <DialogDescription>{t('exams.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <TextField control={control} name="nameAm" label={t('exams.fields.nameAm')} required lang="am" placeholder={t('exams.fields.nameAmPlaceholder')} />
          <TextField control={control} name="nameEn" label={t('exams.fields.nameEn')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={control}
              name="classTypeId"
              label={t('exams.fields.class')}
              required
              options={(classTypes ?? []).map((c) => ({ value: String(c.id), label: name(c) }))}
            />
            <SelectField
              control={control}
              name="classGradeId"
              label={t('exams.fields.level')}
              allowEmpty
              emptyLabel={t('exams.fields.allLevels')}
              options={(chosenClass?.grades ?? []).map((g) => ({ value: String(g.id), label: gradeLabel(g) }))}
            />
          </div>
          {!exam && <p className="-mt-2 text-xs text-muted-foreground">{t('exams.fields.candidatesHint')}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField control={control} name="heldOn" label={t('exams.fields.heldOn')} clearable />
            <TextField
              control={control}
              name="passMark"
              label={t('exams.fields.passMark')}
              description={t('exams.fields.passMarkHint')}
              inputMode="numeric"
              required
            />
          </div>
          <TextareaField control={control} name="description" label={t('exams.fields.description')} rows={2} />

          {!exam && (
            <Field>
              <FieldLabel>{t('exams.parts.title')}</FieldLabel>
              <p className="-mt-1 text-sm text-muted-foreground">{t('exams.parts.body')}</p>
              <PartsEditor rows={parts} onChange={setParts} />
            </Field>
          )}

          {(partsError ?? form.formState.errors.root?.server?.message) && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {partsError ?? form.formState.errors.root?.server?.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {exam ? t('common.save') : t('exams.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
