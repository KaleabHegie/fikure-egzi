import type { PermissionCode } from '@/lib/permissions'

export interface AuthUser {
  id: number
  email: string
  fullName: string
  roles: string[]
  permissions: PermissionCode[]
  /** Departments the user may act in; null = all (office administrators). */
  departmentIds: number[] | null
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: AuthUser
}
