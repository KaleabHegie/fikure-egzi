import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { AssetCondition, AssetStatus } from '../types'

const STATUS_STYLES: Record<AssetStatus, string> = {
  IN_USE: 'bg-success/12 text-success',
  IN_STORE: 'bg-accent text-accent-foreground',
  UNDER_REPAIR: 'bg-warning/15 text-[oklch(0.45_0.1_70)] dark:text-warning',
  LOST: 'bg-destructive/10 text-destructive',
  DISPOSED: 'bg-muted text-muted-foreground',
}

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { t } = useTranslation()
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap', STATUS_STYLES[status])}>
      {t(`assets.statuses.${status}`)}
    </span>
  )
}

const CONDITION_DOT: Record<AssetCondition, string> = {
  NEW: 'bg-success',
  GOOD: 'bg-success',
  FAIR: 'bg-warning',
  POOR: 'bg-destructive',
  BROKEN: 'bg-destructive',
}

export function AssetConditionLabel({ condition }: { condition: AssetCondition }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className={cn('size-2 rounded-full', CONDITION_DOT[condition])} aria-hidden />
      {t(`assets.conditions.${condition}`)}
    </span>
  )
}
