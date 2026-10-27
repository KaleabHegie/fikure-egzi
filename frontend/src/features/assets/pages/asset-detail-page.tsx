import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { applyAssetPhoto, assetsApi, useAsset, useAssetMutation } from '../api'
import { AssetConditionLabel, AssetStatusBadge } from '../components/asset-badges'
import { useBirr } from '../use-birr'
import { AssetDialog } from '../components/asset-dialog'
import { AssetPhoto } from '../components/asset-photo'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children ?? '—'}</dd>
    </div>
  )
}

export function AssetDetailPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const birr = useBirr()
  const navigate = useNavigate()
  const id = Number(useParams().id)
  const { can } = useAuth()
  const canManage = can(PERMISSIONS.ASSETS_MANAGE)
  const asset = useAsset(id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const update = useAssetMutation((input: Parameters<typeof assetsApi.update>[1]) => assetsApi.update(id, input))
  const remove = useAssetMutation(() => assetsApi.remove(id))

  if (asset.isError) return <ErrorState error={asset.error} onRetry={() => void asset.refetch()} />
  if (asset.isPending) return <Skeleton className="h-96 rounded-xl" />
  const a = asset.data

  return (
    <>
      <PageHeader
        back={{ to: '/assets', label: t('assets.title') }}
        title={a.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{a.assetCode}</span>
            <AssetStatusBadge status={a.status} />
            <span>{t(`assets.categories.${a.category}`)}</span>
          </span>
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" size="lg" onClick={() => setEditing(true)}>
                <Pencil />
                {t('common.edit')}
              </Button>
              <Button variant="outline" size="lg" onClick={() => setDeleting(true)} aria-label={t('common.delete')}>
                <Trash2 />
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <AssetPhoto asset={a} className="aspect-square w-full rounded-xl border lg:w-80" />
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label={t('assets.fields.department')}>{name(a.department)}</Detail>
              <Detail label={t('assets.fields.quantity')}>{a.quantity}</Detail>
              <Detail label={t('assets.fields.condition')}>
                <AssetConditionLabel condition={a.condition} />
              </Detail>
              <Detail label={t('assets.fields.location')}>{a.location}</Detail>
              <Detail label={t('assets.fields.serialNumber')}>{a.serialNumber}</Detail>
              <Detail label={t('assets.fields.acquisition')}>
                {a.acquisition ? t(`assets.acquisitions.${a.acquisition}`) : null}
                {a.donorName && ` · ${a.donorName}`}
              </Detail>
              <Detail label={t('assets.fields.acquiredOn')}>{a.acquiredOn ? formatDate(a.acquiredOn) : null}</Detail>
              <Detail label={t('assets.fields.cost')}>{a.cost != null ? birr(a.cost) : null}</Detail>
            </dl>
          </section>
          {(a.description || a.notes) && (
            <section className="space-y-3 rounded-xl border bg-card p-5">
              {a.description && <Detail label={t('assets.fields.description')}>{a.description}</Detail>}
              {a.notes && <Detail label={t('assets.fields.notes')}>{a.notes}</Detail>}
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            {t('assets.recorded', { created: formatDateTime(a.createdAt), updated: formatDateTime(a.updatedAt) })}
          </p>
        </div>
      </div>

      <AssetDialog
        open={editing}
        onOpenChange={setEditing}
        asset={a}
        onSave={async (input, photo) => {
          await update.mutateAsync(input)
          await applyAssetPhoto(id, photo)
          void asset.refetch()
          toast.success(t('assets.saved'))
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('assets.deleteTitle')}
        description={t('assets.deleteBody', { name: a.name })}
        confirmLabel={t('common.delete')}
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success(t('assets.deleted'))
              navigate('/assets', { replace: true })
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </>
  )
}
