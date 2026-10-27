import { Package, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { PERMISSIONS } from '@/lib/permissions'
import { applyAssetPhoto, assetsApi, useAssetMutation, useAssets } from '../api'
import { AssetConditionLabel, AssetStatusBadge } from '../components/asset-badges'
import { useBirr } from '../use-birr'
import { AssetDialog } from '../components/asset-dialog'
import { AssetPhoto } from '../components/asset-photo'
import { ASSET_CATEGORIES, ASSET_STATUSES, type AssetCategory, type AssetListParams, type AssetStatus } from '../types'

const ALL = '__all__'

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-xl font-semibold">{value}</p>
    </div>
  )
}

export function AssetsPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const birr = useBirr()
  const navigate = useNavigate()
  const { can } = useAuth()
  const { data: departments } = useDepartments()
  const [search, setSearch] = useState('')
  const [params, setParams] = useState<AssetListParams>({ page: 1, pageSize: 20 })
  const [creating, setCreating] = useState(false)
  const query = useDebounced(search.trim())
  const assets = useAssets({ ...params, search: query || undefined })
  const create = useAssetMutation(assetsApi.create)
  const set = (patch: Partial<AssetListParams>) => setParams((p) => ({ ...p, page: 1, ...patch }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('assets.title')}
        description={t('assets.description')}
        actions={
          can(PERMISSIONS.ASSETS_MANAGE) && (
            <Button size="lg" onClick={() => setCreating(true)}>
              <Plus />
              {t('assets.new')}
            </Button>
          )
        }
      />

      {assets.data && (
        <div className="grid grid-cols-3 gap-3">
          <Total label={t('assets.totals.assets')} value={assets.data.meta.totals.assets.toLocaleString()} />
          <Total label={t('assets.totals.items')} value={assets.data.meta.totals.items.toLocaleString()} />
          <Total label={t('assets.totals.value')} value={birr(assets.data.meta.totals.value)} />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setParams((p) => ({ ...p, page: 1 }))
            }}
            placeholder={t('assets.search')}
            aria-label={t('assets.search')}
            className="pl-8"
          />
        </div>
        <Select value={params.category ?? ALL} onValueChange={(v) => set({ category: v === ALL ? undefined : (v as AssetCategory) })}>
          <SelectTrigger className="sm:w-48" aria-label={t('assets.fields.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('assets.filters.allCategories')}</SelectItem>
            {ASSET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`assets.categories.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.status ?? ALL} onValueChange={(v) => set({ status: v === ALL ? undefined : (v as AssetStatus) })}>
          <SelectTrigger className="sm:w-44" aria-label={t('assets.fields.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('assets.filters.allStatuses')}</SelectItem>
            {ASSET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`assets.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(departments?.length ?? 0) > 1 && (
          <Select
            value={params.departmentId ? String(params.departmentId) : ALL}
            onValueChange={(v) => set({ departmentId: v === ALL ? undefined : Number(v) })}
          >
            <SelectTrigger className="sm:w-56" aria-label={t('assets.fields.department')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('assets.filters.allDepartments')}</SelectItem>
              {departments!.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {name(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {assets.isError ? (
        <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
      ) : assets.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : assets.data.data.length === 0 ? (
        <EmptyState
          icon={Package}
          title={query || params.category || params.status || params.departmentId ? t('assets.noMatch') : t('assets.empty')}
          description={t('assets.emptyBody')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t('assets.fields.name')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('assets.fields.department')}</TableHead>
                  <TableHead className="text-right">{t('assets.fields.quantity')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('assets.fields.condition')}</TableHead>
                  <TableHead>{t('assets.fields.status')}</TableHead>
                  <TableHead className="hidden pr-4 lg:table-cell">{t('assets.fields.location')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.data.data.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/assets/${a.id}`)}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <AssetPhoto asset={a} className="size-10" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{a.assetCode}</span> · {t(`assets.categories.${a.category}`)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{name(a.department)}</TableCell>
                    <TableCell className="tabular text-right">{a.quantity}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <AssetConditionLabel condition={a.condition} />
                    </TableCell>
                    <TableCell>
                      <AssetStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="hidden pr-4 text-sm text-muted-foreground lg:table-cell">{a.location ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4">
            <PaginationBar
              meta={assets.data.meta}
              onPageChange={(page) => setParams((p) => ({ ...p, page }))}
              onPageSizeChange={(pageSize) => set({ pageSize })}
            />
          </div>
        </div>
      )}

      <AssetDialog
        open={creating}
        onOpenChange={setCreating}
        onSave={async (input, photo) => {
          const asset = await create.mutateAsync(input)
          try {
            await applyAssetPhoto(asset.id, photo)
          } catch {
            toast.warning(t('assets.photoFailed'))
          }
          toast.success(t('assets.created', { code: asset.assetCode }))
          navigate(`/assets/${asset.id}`)
        }}
      />
    </div>
  )
}
