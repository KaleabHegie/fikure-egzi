import type { AttendanceStatus } from './types'

/** Badge/segment colours per status (text colour doubles as the count colour). */
export const STATUS_STYLES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success/12 text-success',
  LATE: 'bg-warning/15 text-[oklch(0.45_0.1_70)] dark:text-warning',
  ABSENT: 'bg-destructive/10 text-destructive',
  EXCUSED: 'bg-muted text-muted-foreground',
}
