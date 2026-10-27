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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLocalizedName } from '@/features/classes/use-localized'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import type { Department, DepartmentInput, DepartmentMembership } from '../types'

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1, msg('validation.required'))
    .max(40, msg('validation.tooLong', { max: 40 }))
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z][A-Z0-9_]*$/, msg('validation.codeFormat'))),
  nameEn: z.string().trim().min(1, msg('validation.required')).max(120, msg('validation.tooLong', { max: 120 })),
  nameAm: z.string().trim().min(1, msg('validation.required')).max(120, msg('validation.tooLong', { max: 120 })),
  descriptionEn: z.string().trim().max(500, msg('validation.tooLong', { max: 500 })),
  descriptionAm: z.string().trim().max(500, msg('validation.tooLong', { max: 500 })),
  parentId: z.string(),
  headMemberId: z.string(),
  isActive: z.boolean(),
})
type Values = z.input<typeof schema>

/** Ids of `id` and everything below it — not valid as its new parent. */
function selfAndDescendants(id: number, all: Department[]): Set<number> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const d of all) {
      if (d.parentId !== null && out.has(d.parentId) && !out.has(d.id)) {
        out.add(d.id)
        grew = true
      }
    }
  }
  return out
}

/** Create (`department` undefined) or edit a department. */
export function DepartmentDialog({
  open,
  onOpenChange,
  department,
  defaultParentId,
  allDepartments,
  headMembers,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  department?: Department
  defaultParentId?: number | null
  allDepartments: Department[]
  /** Set only while a department head creates a sub-department. */
  headMembers?: DepartmentMembership[]
  onSave: (input: DepartmentInput, headMemberId?: number) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const excluded = department ? selfAndDescendants(department.id, allDepartments) : new Set<number>()
  const parentOptions = allDepartments
    .filter((d) => !excluded.has(d.id))
    .map((d) => ({ value: String(d.id), label: name(d) }))

  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    values: {
      code: department?.code ?? '',
      nameEn: department?.nameEn ?? '',
      nameAm: department?.nameAm ?? '',
      descriptionEn: department?.descriptionEn ?? '',
      descriptionAm: department?.descriptionAm ?? '',
      parentId: String(department ? (department.parentId ?? '') : (defaultParentId ?? '')),
      headMemberId: '',
      isActive: department?.isActive ?? true,
    },
  })
  const { control } = form

  const submit = form.handleSubmit(async (v) => {
    if (headMembers && !v.headMemberId) {
      form.setError('headMemberId', { message: msg('validation.required') })
      return
    }
    try {
      await onSave({
        ...v,
        descriptionEn: v.descriptionEn || null,
        descriptionAm: v.descriptionAm || null,
        parentId: v.parentId ? Number(v.parentId) : null,
      }, headMembers ? Number(v.headMemberId) : undefined)
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, Object.keys(schema.shape))) {
        form.setError('root.server', { message: getErrorMessage(error) })
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{department ? t('departments.editDepartment') : t('departments.newDepartment')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <TextField
            control={control}
            name="code"
            label={t('departments.fields.code')}
            description={department ? undefined : t('departments.fields.codeHint')}
            required
            disabled={Boolean(department)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="nameEn" label={t('departments.fields.nameEn')} required />
            <TextField control={control} name="nameAm" label={t('departments.fields.nameAm')} required lang="am" />
          </div>
          {!headMembers && (
            <SelectField
              control={control}
              name="parentId"
              label={t('departments.fields.parent')}
              options={parentOptions}
              allowEmpty
              emptyLabel={t('departments.topLevel')}
            />
          )}
          {headMembers && (
            <SelectField
              control={control}
              name="headMemberId"
              label={t('departments.fields.head')}
              description={t('departments.fields.headHint')}
              required
              options={headMembers.map((membership) => ({
                value: String(membership.member.id),
                label: `${membership.member.firstName} ${membership.member.fatherName} · ${membership.member.memberCode}`,
              }))}
              placeholder={t('departments.fields.chooseHead')}
            />
          )}
          <TextareaField control={control} name="descriptionEn" label={t('departments.fields.descriptionEn')} rows={2} />
          <TextareaField
            control={control}
            name="descriptionAm"
            label={t('departments.fields.descriptionAm')}
            rows={2}
            lang="am"
          />
          <SwitchField
            control={control}
            name="isActive"
            label={t('departments.fields.isActive')}
            description={t('departments.fields.isActiveHint')}
          />
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
              {department ? t('departments.save') : t('departments.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
