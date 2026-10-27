import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PaginationMeta } from '@/lib/api/types'

const PAGE_SIZES = [10, 20, 50, 100]

export function PaginationBar({
  meta,
  onPageChange,
  onPageSizeChange,
}: {
  meta: PaginationMeta
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const { t } = useTranslation()
  const { page, pageSize, total, totalPages } = meta
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 px-1 py-3 text-sm sm:flex-row">
      <p className="tabular text-muted-foreground">
        {total === 0 ? t('pagination.noResults') : t('pagination.showing', { from, to, total: total.toLocaleString() })}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('pagination.rows')}</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger size="sm" className="w-[4.5rem]" aria-label={t('pagination.rowsPerPage')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t('pagination.previous')}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular min-w-[5.5rem] text-center text-muted-foreground">
            {t('pagination.page', { page, pages: totalPages })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t('pagination.next')}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
