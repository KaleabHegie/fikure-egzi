import { createContext } from 'react'
import type { AuthUser } from '@/lib/auth/types'
import type { PermissionCode } from '@/lib/permissions'

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** True when the user holds ALL listed permissions. */
  can: (...permissions: PermissionCode[]) => boolean
  /** True when the user may act in this department (always, for office administrators). */
  inDepartment: (departmentId: number | null | undefined) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
