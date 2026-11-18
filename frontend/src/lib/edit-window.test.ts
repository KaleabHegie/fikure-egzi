import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/lib/auth/types'
import { dayAccess, dayOpen } from './edit-window'
import type { PermissionCode } from './permissions'

const user = (more: Partial<AuthUser> = {}): AuthUser => ({
  id: 1,
  email: 'a@b.c',
  fullName: 'A',
  roles: [],
  permissions: [],
  departmentIds: [4],
  ...more,
})
const granting =
  (...granted: string[]) =>
  (...asked: PermissionCode[]) =>
    asked.every((p) => granted.includes(p))

describe('dayAccess / dayOpen', () => {
  it('keeps attendance takers to today and admins to 5 days', () => {
    expect(dayAccess(user(), granting('attendance.take'))).toBe('today')
    expect(dayAccess(user(), granting('attendance.any_day'))).toBe('recent')
    expect(dayAccess(user(), granting('attendance.any_day', 'attendance.override'))).toBe('any')
    expect(dayAccess(user({ inOffice: true }), granting('attendance.any_day'))).toBe('any')

    expect(dayOpen('2026-11-19', 'recent', '2026-11-24')).toBe(true)
    expect(dayOpen('2026-11-19', 'recent', '2026-11-25')).toBe(false)
    expect(dayOpen('2026-11-19', 'any', '2027-01-01')).toBe(true)
    expect(dayOpen('2026-11-23', 'today', '2026-11-24')).toBe(false)
  })
})
