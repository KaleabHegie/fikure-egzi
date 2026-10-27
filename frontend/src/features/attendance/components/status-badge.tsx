import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { STATUS_STYLES } from '../status-styles'
import type { AttendanceStatus } from '../types'

export function AttendanceStatusBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
        STATUS_STYLES[status],
        className,
      )}
    >
      {t(`attendance.statuses.${status}`)}
    </span>
  )
}
