import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageSpinner } from '@/components/common/full-page-spinner'
import { ForbiddenPage } from '@/pages/forbidden-page'
import type { PermissionCode } from '@/lib/permissions'
import { useAuth } from './use-auth'

/** Layout route: renders children only for signed-in users. */
export function RequireAuth() {
  const { t } = useTranslation()
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'restoring') return <FullPageSpinner label={t('auth.restoring')} />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Route wrapper: renders a 403 page when a permission is missing. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionCode
  children: React.ReactNode
}) {
  const { can } = useAuth()
  return can(permission) ? children : <ForbiddenPage />
}

/** Inline wrapper: hides UI (buttons, menu items) the user cannot use. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionCode
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { can } = useAuth()
  return can(permission) ? children : fallback
}
