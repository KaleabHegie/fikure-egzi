import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextareaField, TextField } from '@/components/form/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import type { PhotoChange } from '@/features/members/api'
import { PhotoPicker } from '@/features/members/components/photo-picker'
import { msg } from '@/i18n'
import { applyApiFieldErrors, getErrorMessage } from '@/lib/api/errors'
import { useAssetPhoto } from '../api'
import {
  ASSET_ACQUISITIONS,
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  type Asset,
  type AssetInput,
} from '../types'

const text = (max: number) => z.string().trim().max(max, msg('validation.tooLong', { max }))
const schema = z.object({
  name: z.string().trim().min(1, msg('validation.required')).max(150, msg('validation.tooLong', { max: 150 })),
  category: z.string().min(1, msg('validation.required')),
  departmentId: z.string().min(1, msg('validation.required')),
  quantity: z.string().regex(/^[1-9]\d{0,5}$/, msg('assets.validation.quantity')),
  condition: z.enum(ASSET_CONDITIONS),
  status: z.enum(ASSET_STATUSES),
  location: text(150),
  serialNumber: text(100),
  acquisition: z.string(),
  acquiredOn: z.string(),
  cost: z.string().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, msg('assets.validation.cost')),
  donorName: text(150),
  description: text(1000),
  notes: text(2000),
})
type Values = z.infer<typeof schema>

const FIELDS = Object.keys(schema.shape)

function initial(asset?: Asset, departmentId?: string): Values {
  return {
    name: asset?.name ?? '',
    category: asset?.category ?? '',
    departmentId: asset ? String(asset.departmentId) : (departmentId ?? ''),
    quantity: String(asset?.quantity ?? 1),
    condition: asset?.condition ?? 'GOOD',
    status: asset?.status ?? 'IN_USE',
    location: asset?.location ?? '',
    serialNumber: asset?.serialNumber ?? '',
    acquisition: asset?.acquisition ?? '',
    acquiredOn: asset?.acquiredOn?.slice(0, 10) ?? '',
    cost: asset?.cost != null ? String(asset.cost) : '',
    donorName: asset?.donorName ?? '',
    description: asset?.description ?? '',
    notes: asset?.notes ?? '',
  }
}

/** Register (`asset` undefined) or edit an asset, with its photo. */
export function AssetDialog({
  open,
  onOpenChange,
  asset,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset?: Asset
  onSave: (input: AssetInput, photo: PhotoChange) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  // Department admins only get their own departments; with one, it's preselected.
  const { data: departments } = useDepartments()
  const only = departments?.length === 1 ? String(departments[0]!.id) : undefined
  const currentPhoto = useAssetPhoto(asset)
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' })
  const form = useForm<Values>({ resolver: zodResolver(schema), values: initial(asset, only) })
  const { control } = form
  const acquisition = useWatch({ control, name: 'acquisition' })

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSave(
        {
          name: v.name,
          category: v.category as AssetInput['category'],
          departmentId: Number(v.departmentId),
          quantity: Number(v.quantity),
          condition: v.condition,
          status: v.status,
          location: v.location || null,
          serialNumber: v.serialNumber || null,
          acquisition: (v.acquisition || null) as AssetInput['acquisition'],
          acquiredOn: v.acquiredOn || null,
          cost: v.cost ? Number(v.cost) : null,
          donorName: v.acquisition === 'DONATED' ? v.donorName || null : null,
          description: v.description || null,
          notes: v.notes || null,
        },
        photo,
      )
      setPhoto({ kind: 'keep' })
      onOpenChange(false)
    } catch (error) {
      if (!applyApiFieldErrors(error, form.setError, FIELDS)) form.setError('root.server', { message: getErrorMessage(error) })
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPhoto({ kind: 'keep' })
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{asset ? t('assets.edit') : t('assets.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <PhotoPicker currentUrl={currentPhoto} change={photo} onChange={setPhoto} disabled={form.formState.isSubmitting} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="name" label={t('assets.fields.name')} required className="sm:col-span-2" />
            <SelectField
              control={control}
              name="category"
              label={t('assets.fields.category')}
              required
              options={ASSET_CATEGORIES.map((c) => ({ value: c, label: t(`assets.categories.${c}`) }))}
            />
            <SelectField
              control={control}
              name="departmentId"
              label={t('assets.fields.department')}
              description={t('assets.fields.departmentHint')}
              required
              options={(departments ?? []).map((d) => ({ value: String(d.id), label: name(d) }))}
            />
            <TextField control={control} name="quantity" label={t('assets.fields.quantity')} type="number" inputMode="numeric" min={1} required />
            <TextField control={control} name="location" label={t('assets.fields.location')} />
            <SelectField
              control={control}
              name="condition"
              label={t('assets.fields.condition')}
              required
              options={ASSET_CONDITIONS.map((c) => ({ value: c, label: t(`assets.conditions.${c}`) }))}
            />
            <SelectField
              control={control}
              name="status"
              label={t('assets.fields.status')}
              required
              options={ASSET_STATUSES.map((s) => ({ value: s, label: t(`assets.statuses.${s}`) }))}
            />
            <SelectField
              control={control}
              name="acquisition"
              label={t('assets.fields.acquisition')}
              options={ASSET_ACQUISITIONS.map((a) => ({ value: a, label: t(`assets.acquisitions.${a}`) }))}
              allowEmpty
            />
            <DateField control={control} name="acquiredOn" label={t('assets.fields.acquiredOn')} />
            <TextField control={control} name="cost" label={t('assets.fields.cost')} inputMode="decimal" />
            <TextField control={control} name="serialNumber" label={t('assets.fields.serialNumber')} />
            {acquisition === 'DONATED' && (
              <TextField control={control} name="donorName" label={t('assets.fields.donorName')} className="sm:col-span-2" />
            )}
          </div>
          <TextareaField control={control} name="description" label={t('assets.fields.description')} rows={2} />
          <TextareaField control={control} name="notes" label={t('assets.fields.notes')} rows={2} />
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
              {asset ? t('assets.save') : t('assets.register')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
