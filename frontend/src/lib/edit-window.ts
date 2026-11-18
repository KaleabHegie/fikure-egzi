import type { AuthUser } from '@/lib/auth/types'
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions'

/**
 * Mirror of backend/src/common/auth/edit-window.ts: exam takers and
 * attendance admins change an exam or a session up to the 5th day after its
 * day; department heads, the ፅህፈት ቤት and office administrators any time.
 */
export const EDIT_WINDOW_DAYS = 5

/** 'YYYY-MM-DD' moved by whole days. */
export const shiftIso = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Which days the user may work on attendance for: today only, up to 5 days back, or any day. */
export type DayAccess = 'today' | 'recent' | 'any'

type Can = (...permissions: PermissionCode[]) => boolean

/** Department heads, the ፅህፈት ቤት and office administrators: no 5-day limit. */
export const oversees = (user: AuthUser | null, can: Can, override: PermissionCode) =>
  user?.departmentIds === null || Boolean(user?.inOffice) || can(override)

export function dayAccess(user: AuthUser | null, can: Can): DayAccess {
  if (!can(PERMISSIONS.ATTENDANCE_ANY_DAY)) return 'today'
  return oversees(user, can, PERMISSIONS.ATTENDANCE_OVERRIDE) ? 'any' : 'recent'
}

/** Whether attendance of `dayIso` may still be changed, `todayIso` being today in Addis Ababa. */
export function dayOpen(dayIso: string, access: DayAccess, todayIso: string): boolean {
  if (access === 'any') return true
  if (access === 'today') return dayIso === todayIso
  return todayIso <= shiftIso(dayIso, EDIT_WINDOW_DAYS)
}
