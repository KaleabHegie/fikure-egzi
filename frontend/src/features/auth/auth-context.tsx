import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { authApi, refreshSession } from '@/lib/api/client'
import { session } from '@/lib/auth/session'
import { AuthContext, type AuthContextValue } from './context'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.get)
  const [restoring, setRestoring] = useState(() => Boolean(session.getRefreshToken()))

  // On first load, trade a stored refresh token for a fresh access token.
  useEffect(() => {
    if (!restoring) return
    refreshSession()
      .catch(() => undefined)
      .finally(() => setRestoring(false))
  }, [restoring])

  const login = useCallback(async (email: string, password: string) => {
    session.start(await authApi.login(email, password))
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = session.getRefreshToken()
    try {
      if (refreshToken && session.getAccessToken()) await authApi.logout(refreshToken)
    } catch {
      // Logging out locally must always succeed, even if the API is unreachable.
    } finally {
      session.clear()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const granted = new Set(snapshot.user?.permissions ?? [])
    return {
      status: restoring ? 'restoring' : snapshot.user ? 'authenticated' : 'anonymous',
      user: snapshot.user,
      login,
      logout,
      can: (...permissions) => permissions.every((p) => granted.has(p)),
      inDepartment: (departmentId) => {
        const scope = snapshot.user?.departmentIds
        return scope === null || (departmentId != null && !!scope?.includes(departmentId))
      },
    }
  }, [snapshot.user, restoring, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
