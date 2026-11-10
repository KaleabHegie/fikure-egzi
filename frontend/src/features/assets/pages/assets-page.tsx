import { Banknote, Boxes, ListFilter, Package, Plus, Search, Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FilterChip } from '@/components/common/filter-chip'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { PERMISSIONS } from '@/lib/permissions'
import { applyAssetPhoto, assetsApi, useAssetCategories, useAssetMutation, useAssets } from '../api'
import { AssetConditionLabel, AssetStatusBadge } from '../components/asset-badges'
import { useBirr } from '../use-birr'
import { AssetDialog } from '../components/asset-dialog'
import { AssetPhoto } from '../components/asset-photo'
import { CategoryManageDialog } from '../components/category-manage-dialog'
import { ASSET_STATUSES, type AssetListParams, type AssetStatus } from '../types'
import { TreeMark } from '@/components/common/tree-mark'
import { departmentTreeOrder } from '@/features/departments/types'
import { cn } from '@/lib/utils'

const ALL = '__all__'

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Totals in the register style: medallion icon, serif figure. */
function Total({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
    <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-brand ring-1 ring-gold/60 ring-offset-2 ring-offset-card"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="tabular truncate font-record text-xl leading-tight font-semibold">{value}</p>
      </div>
    </div>
  )
}

export function AssetsPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const birr = useBirr()
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const { data: departments } = useDepartments()
  const { data: categories } = useAssetCategories()
  const [search, setSearch] = useState('')
  const [params, setParams] = useState<AssetListParams>({ page: 1, pageSize: 20 })
  const [creating, setCreating] = useState(false)
  const [managingCategories, setManagingCategories] = useState(false)
  const query = useDebounced(search.trim())
  const assets = useAssets({ ...params, search: query || undefined })
  const create = useAssetMutation(assetsApi.create)
  const set = (patch: Partial<AssetListParams>) => setParams((p) => ({ ...p, page: 1, ...patch }))

  // Categories are shared by every department, so only office admins manage them.
  const canManageCategories = can(PERMISSIONS.ASSETS_MANAGE) && user?.departmentIds === null
  const category = categories?.find((c) => c.id === params.categoryId)
  const department = departments?.find((d) => d.id === params.departmentId)
  const activeFilters = (params.categoryId ? 1 : 0) + (params.status ? 1 : 0) + (params.departmentId ? 1 : 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('assets.title')}
        description={t('assets.description')}
        actions={
          <>
            {canManageCategories && (
              <Button size="lg" variant="outline" onClick={() => setManagingCategories(true)}>
                <Tags />
                {t('assets.categoriesManage.button')}
              </Button>
            )}
            {can(PERMISSIONS.ASSETS_MANAGE) && (
              <Button size="lg" onClick={() => setCreating(true)}>
                <Plus />
                {t('assets.new')}
              </Button>
            )}
          </>
        }
      />

      {assets.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Total icon={Package} label={t('assets.totals.assets')} value={assets.data.meta.totals.assets.toLocaleString()} />
          <Total icon={Boxes} label={t('assets.totals.items')} value={assets.data.meta.totals.items.toLocaleString()} />
          <Total icon={Banknote} label={t('assets.totals.value')} value={birr(assets.data.meta.totals.value)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
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

        {category && (
          <FilterChip
            category={t('assets.fields.category')}
            value={name(category)}
            onClear={() => set({ categoryId: undefined })}
          />
        )}
        {params.status && (
          <FilterChip
            category={t('assets.fields.status')}
            value={t(`assets.statuses.${params.status}`)}
            onClear={() => set({ status: undefined })}
          />
        )}
        {department && (
          <FilterChip
            category={t('assets.fields.department')}
            value={name(department)}
            onClear={() => set({ departmentId: undefined })}
          />
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ListFilter />
              {t('common.filter')}
              {activeFilters > 0 && (
                <span className="tabular grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {activeFilters}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('assets.fields.category')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                <DropdownMenuRadioGroup
                  value={params.categoryId ? String(params.categoryId) : ALL}
                  onValueChange={(v) => set({ categoryId: v === ALL ? undefined : Number(v) })}
                >
                  <DropdownMenuRadioItem value={ALL}>{t('assets.filters.allCategories')}</DropdownMenuRadioItem>
                  {(categories ?? []).map((c) => (
                    <DropdownMenuRadioItem key={c.id} value={String(c.id)}>
                      {name(c)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('assets.fields.status')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={params.status ?? ALL}
                  onValueChange={(v) => set({ status: v === ALL ? undefined : (v as AssetStatus) })}
                >
                  <DropdownMenuRadioItem value={ALL}>{t('assets.filters.allStatuses')}</DropdownMenuRadioItem>
                  {ASSET_STATUSES.map((s) => (
                    <DropdownMenuRadioItem key={s} value={s}>
                      {t(`assets.statuses.${s}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {(departments?.length ?? 0) > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t('assets.fields.department')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={params.departmentId ? String(params.departmentId) : ALL}
                    onValueChange={(v) => set({ departmentId: v === ALL ? undefined : Number(v) })}
                  >
                    <DropdownMenuRadioItem value={ALL}>{t('assets.filters.allDepartments')}</DropdownMenuRadioItem>
                    {departmentTreeOrder(departments!).map(({ department: d, depth, hasChildren }) => (
                      <DropdownMenuRadioItem key={d.id} value={String(d.id)} className={cn(hasChildren && 'font-medium')}>
                        <TreeMark depth={depth} />
                        {name(d)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {assets.isError ? (
        <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
      ) : assets.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : assets.data.data.length === 0 ? (
        <EmptyState
          icon={Package}
          title={query || activeFilters > 0 ? t('assets.noMatch') : t('assets.empty')}
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
                            <span className="font-mono">{a.assetCode}</span> · {name(a.category)}
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
      <CategoryManageDialog open={managingCategories} onOpenChange={setManagingCategories} />
    </div>
  )
}
