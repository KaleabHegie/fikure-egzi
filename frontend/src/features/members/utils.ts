import type { Member } from './types'

/** Ethiopian full name: given + father's + grandfather's name. */
export function memberFullName(m: Pick<Member, 'firstName' | 'fatherName' | 'grandfatherName'>): string {
  return [m.firstName, m.fatherName, m.grandfatherName].filter(Boolean).join(' ')
}
