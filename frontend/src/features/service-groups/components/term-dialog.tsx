import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, SwitchField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocalizedName } from '@/features/classes/use-localized'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { ecToday, ecYearBounds } from '@/lib/ethiopian-calendar'
import type { ServiceTerm, ServiceTermInput } from '../types'

const name = z.string().trim().min(1, msg('validation.required')).max(100, msg('validation.tooLong', { max: 100 }))
const schema = z
  .object({
    nameEn: name,
    nameAm: name,
    startsOn: z.string().min(1, msg('validation.required')),
    endsOn: z.string().min(1, msg('validation.required')),
    isCurrent: z.boolean(),
    copyFromTermId: z.string(),
    copyMembers: z.boolean(),
  })
  .refine((v) => v.endsOn > v.startsOn, { path: ['endsOn'], message: msg('validation.date') })
type Values = z.infer<typeof schema>

const FIELDS = ['nameEn', 'nameAm', 'startsOn', 'endsOn']

/** A new term defaults to one whole E.C. year: this year, or the next one if this year already has a term. */
function suggestedYear(terms: ServiceTerm[]) {
  const year = ecToday().year
  const taken = terms.some((x) => x.startsOn.slice(0, 10) >= ecYearBounds(year).start)
  return taken ? year + 1 : year
}

/** Create (`term` undefined) or edit a service term. New terms can start from a previous term's groups. */
export function TermDialog({
  open,
  onOpenChange,
  term,
  terms,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  term?: ServiceTerm
  terms: ServiceTerm[]
  onSave: (input: ServiceTermInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const localized = useLocalizedName()
  const year = suggestedYear(terms)
  const bounds = ecYearBounds(year)
  const latest = terms[0]
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: term
      ? {
          nameEn: term.nameEn,
          nameAm: term.nameAm,
          startsOn: term.startsOn.slice(0, 10),
          endsOn: term.endsOn.slice(0, 10),
          isCurrent: term.isCurrent,
          copyFromTermId: '',
          copyMembers: false,
        }
      : {
          nameEn: `${year} E.C.`,
          nameAm: `${year} ዓ.ም`,
          startsOn: bounds.start,
          endsOn: bounds.end,
          isCurrent: true,
          copyFromTermId: latest ? String(latest.id) : '',
          copyMembers: false,
        },
  })
  const { control } = form
  const copyFrom = useWatch({ control, name: 'copyFromTermId' })

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave({
        nameEn: v.nameEn,
        nameAm: v.nameAm,
        startsOn: v.startsOn,
        endsOn: v.endsOn,
        isCurrent: v.isCurrent,
        ...(!term && v.copyFromTermId && { copyFromTermId: Number(v.copyFromTermId), copyMembers: v.copyMembers }),
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
          <DialogTitle>{term ? t('serviceGroups.editTerm') : t('serviceGroups.newTerm')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="nameAm" label={t('serviceGroups.fields.nameAm')} required />
            <TextField control={control} name="nameEn" label={t('serviceGroups.fields.nameEn')} required />
            <DateField control={control} name="startsOn" label={t('serviceGroups.fields.startsOn')} required />
            <DateField control={control} name="endsOn" label={t('serviceGroups.fields.endsOn')} required />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t('serviceGroups.fields.termHint')}</p>
          <SwitchField
            control={control}
            name="isCurrent"
            label={t('serviceGroups.fields.isCurrent')}
            description={t('serviceGroups.fields.isCurrentHint')}
          />
          {!term && terms.length > 0 && (
            <>
              <SelectField
                control={control}
                name="copyFromTermId"
                label={t('serviceGroups.fields.copyFrom')}
                options={terms.map((x) => ({ value: String(x.id), label: localized(x) }))}
                allowEmpty
                emptyLabel={t('serviceGroups.fields.startEmpty')}
              />
              {copyFrom && (
                <SwitchField
                  control={control}
                  name="copyMembers"
                  label={t('serviceGroups.fields.copyMembers')}
                  description={t('serviceGroups.fields.copyMembersHint')}
                />
              )}
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
              {t('serviceGroups.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
