export const USER_ROLES = ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'ATTENDANCE_TAKER', 'TEACHER'] as const
export type UserRoleCode = (typeof USER_ROLES)[number]

export interface UserRole {
  code: UserRoleCode
  name: string
  description?: string | null
  departmentScoped: boolean
}

/** Mirrors the API's user payload. */
export interface SystemUser {
  id: number
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  role: Omit<UserRole, 'description'> | null
  departments: { id: number; nameEn: string; nameAm: string }[]
  /** Teachers: their member record. */
  member: { id: number; memberCode: string; firstName: string; fatherName: string; grandfatherName: string | null } | null
}

/** A member who can be given a teacher login (GET /users/member-candidates). */
export interface MemberCandidate {
  id: number
  memberCode: string
  firstName: string
  fatherName: string
  grandfatherName: string | null
  christianName: string | null
  phone: string | null
  hasPhoto: boolean
  hasLogin: boolean
}

export interface UserInput {
  fullName: string
  email: string
  phone: string | null
  roleCode: UserRoleCode
  departmentIds: number[]
  memberId?: number | null
  password?: string
  isActive?: boolean
}
