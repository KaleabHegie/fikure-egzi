import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { useAuth } from '@/features/auth/use-auth'
import type { ServiceGroup, ServiceGroupInput } from '../types'
import { useGradeOptions } from '../use-grade-options'

const name = z.string().trim().min(1, msg('validation.required')).max(100, msg('validation.tooLong', { max: 100 }))
const schema = z.object({
  nameEn: name,
  nameAm: name,
  classGradeId: z.string(),
  notes: z.string().trim().max(500, msg('validation.tooLong', { max: 500 })),
})
type Values = z.infer<typeof schema>

/** Create (`group` undefined) or edit a service group. `nextNumber` suggests "Group N". */
export function GroupDialog({
  open,
  onOpenChange,
  group,
  nextNumber,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: ServiceGroup
  nextNumber: number
  onSave: (input: ServiceGroupInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const { options, defaultGradeId } = useGradeOptions()
  // Department admins must pick one of their classes; only the office can leave it mixed.
  const office = useAuth().user?.departmentIds === null
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: group
      ? {
          nameEn: group.nameEn,
          nameAm: group.nameAm,
          classGradeId: group.classGradeId ? String(group.classGradeId) : '',
          notes: group.notes ?? '',
        }
      : {
          nameEn: `Group ${nextNumber}`,
          nameAm: `ምድብ ${nextNumber}`,
          classGradeId: defaultGradeId,
          notes: '',
        },
  })
  const { control } = form

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({
        nameEn: v.nameEn,
        nameAm: v.nameAm,
        classGradeId: v.classGradeId ? Number(v.classGradeId) : null,
        notes: v.notes || null,
      })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, ['nameEn', 'nameAm', 'classGradeId', 'notes'])) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? t('serviceGroups.editGroup') : t('serviceGroups.newGroup')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="nameAm" label={t('serviceGroups.fields.nameAm')} required />
            <TextField control={control} name="nameEn" label={t('serviceGroups.fields.nameEn')} required />
          </div>
          <SelectField
            control={control}
            name="classGradeId"
            label={t('serviceGroups.fields.classGrade')}
            description={t('serviceGroups.fields.classGradeHint')}
            options={options}
            required={!office}
            allowEmpty={office}
            emptyLabel={t('serviceGroups.fields.mixed')}
          />
          <TextareaField control={control} name="notes" label={t('serviceGroups.fields.notes')} rows={2} />
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
              {t('serviceGroups.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
