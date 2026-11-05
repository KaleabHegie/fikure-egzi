import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** An active filter as a removable chip: "category: value ×". */
export function FilterChip({
  category,
  value,
  onClear,
}: {
  category: string
  value: string
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${category}: ${value} — ${t('common.clear')}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-accent/60 pr-2 pl-3 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="text-muted-foreground">{category}:</span>
      <span className="font-semibold">{value}</span>
      <X className="size-3.5 text-muted-foreground" aria-hidden />
    </button>
  )
}
