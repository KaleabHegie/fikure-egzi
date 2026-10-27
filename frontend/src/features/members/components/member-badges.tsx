import { cn } from '@/lib/utils'
import { useMemberLabels } from '../labels'
import type { MembershipStatus } from '../types'

const STATUS_STYLES: Record<MembershipStatus, string> = {
  ACTIVE: 'bg-success/12 text-success',
  INACTIVE: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status, className }: { status: MembershipStatus; className?: string }) {
  const labels = useMemberLabels()
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {labels.status(status)}
    </span>
  )
}
