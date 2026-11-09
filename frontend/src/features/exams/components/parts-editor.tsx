import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { blankPart, type PartRow, partsTotal } from '../parts'

/**
 * The parts of an exam and their weights (e.g. እንቅስቃሴ 40 · ዜማ 60). Each part
 * is marked out of its weight; together they should make 100.
 */
export function PartsEditor({ rows, onChange }: { rows: PartRow[]; onChange: (rows: PartRow[]) => void }) {
  const { t } = useTranslation()
  const total = partsTotal(rows)
  const set = (key: string, patch: Partial<PartRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_6rem_2.25rem] gap-2 px-0.5 text-xs font-medium text-muted-foreground">
        <span>{t('exams.parts.name')}</span>
        <span>{t('exams.parts.weight')}</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-[1fr_6rem_2.25rem] items-center gap-2">
          <Input
            value={r.name}
            onChange={(e) => set(r.key, { name: e.target.value })}
            placeholder={i === 0 ? t('exams.parts.example1') : i === 1 ? t('exams.parts.example2') : t('exams.parts.name')}
            aria-label={`${t('exams.parts.name')} ${i + 1}`}
            maxLength={100}
          />
          <div className="relative">
            <Input
              value={r.weight}
              onChange={(e) => set(r.key, { weight: e.target.value.replace(/[^\d.]/g, '') })}
              inputMode="decimal"
              className="tabular pr-7 text-right"
              aria-label={`${t('exams.parts.weight')} ${i + 1}`}
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            aria-label={t('exams.parts.remove', { name: r.name || i + 1 })}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, blankPart()])} disabled={rows.length >= 20}>
          <Plus />
          {t('exams.parts.add')}
        </Button>
        <p
          className={cn(
            'tabular text-sm font-medium',
            total > 100 ? 'text-destructive' : total === 100 ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {t('exams.parts.total', { total })}
        </p>
      </div>
      {total > 0 && total < 100 && <p className="text-xs text-muted-foreground">{t('exams.parts.under100')}</p>}
    </div>
  )
}
