import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { RequireAuth, RequirePermission } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/pages/login-page'
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions'
import { NotFoundPage } from '@/pages/not-found-page'

/**
 * Lazily loads a page module (one JS chunk per page) and, when a permission
 * is given, gates it with <RequirePermission>.
 */
function page<M>(
  load: () => Promise<M>,
  pick: (module: M) => React.ComponentType,
  permission?: PermissionCode,
): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const Page = pick(await load())
      return {
        element: permission ? (
          <RequirePermission permission={permission}>
            <Page />
          </RequirePermission>
        ) : (
          <Page />
        ),
      }
    },
  }
}

/**
 * Route table. Each future module (attendance, education, finance, …) adds
 * one block under the authenticated layout, gated by its read permission.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Members' own page: separate sign-in (member ID + phone), no staff session.
  { path: '/portal', ...page(() => import('@/features/portal/pages/portal-login-page'), (m) => m.PortalLoginPage) },
  { path: '/portal/me', ...page(() => import('@/features/portal/pages/portal-home-page'), (m) => m.PortalHomePage) },
  {
    element: <RequireAuth />,
    children: [
      {
        // Print sheet: outside the app shell so only the cards print.
        path: 'members/cards',
        ...page(
          () => import('@/features/members/pages/member-cards-page'),
          (m) => m.MemberCardsPage,
          PERMISSIONS.MEMBERS_READ,
        ),
      },
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            ...page(() => import('@/features/dashboard/pages/dashboard-page'), (m) => m.DashboardPage),
          },
          {
            path: 'members',
            children: [
              {
                index: true,
                ...page(
                  () => import('@/features/members/pages/members-list-page'),
                  (m) => m.MembersListPage,
                  PERMISSIONS.MEMBERS_READ,
                ),
              },
              {
                path: 'new',
                ...page(
                  () => import('@/features/members/pages/member-create-page'),
                  (m) => m.MemberCreatePage,
                  PERMISSIONS.MEMBERS_CREATE,
                ),
              },
              {
                path: ':id',
                ...page(
                  () => import('@/features/members/pages/member-detail-page'),
                  (m) => m.MemberDetailPage,
                  PERMISSIONS.MEMBERS_READ,
                ),
              },
              {
                path: ':id/edit',
                ...page(
                  () => import('@/features/members/pages/member-edit-page'),
                  (m) => m.MemberEditPage,
                  PERMISSIONS.MEMBERS_UPDATE,
                ),
              },
            ],
          },
          {
            path: 'classes',
            ...page(
              () => import('@/features/classes/pages/classes-page'),
              (m) => m.ClassesPage,
              PERMISSIONS.CLASSES_READ,
            ),
          },
          {
            // Every signed-in user's own account page.
            path: 'profile',
            ...page(() => import('@/features/profile/pages/profile-page'), (m) => m.ProfilePage),
          },
          {
            path: 'courses',
            children: [
              {
                index: true,
                ...page(() => import('@/features/courses/pages/courses-page'), (m) => m.CoursesPage, PERMISSIONS.COURSES_READ),
              },
              {
                path: ':id',
                ...page(
                  () => import('@/features/courses/pages/course-detail-page'),
                  (m) => m.CourseDetailPage,
                  PERMISSIONS.COURSES_READ,
                ),
              },
              {
                path: 'runs/:runId',
                ...page(() => import('@/features/courses/pages/run-page'), (m) => m.RunPage, PERMISSIONS.COURSES_READ),
              },
            ],
          },
          {
            path: 'assets',
            children: [
              {
                index: true,
                ...page(() => import('@/features/assets/pages/assets-page'), (m) => m.AssetsPage, PERMISSIONS.ASSETS_READ),
              },
              {
                path: ':id',
                ...page(
                  () => import('@/features/assets/pages/asset-detail-page'),
                  (m) => m.AssetDetailPage,
                  PERMISSIONS.ASSETS_READ,
                ),
              },
            ],
          },
          {
            path: 'audit',
            ...page(() => import('@/features/audit/pages/audit-page'), (m) => m.AuditPage, PERMISSIONS.AUDIT_READ),
          },
          {
            path: 'users',
            ...page(() => import('@/features/users/pages/users-page'), (m) => m.UsersPage, PERMISSIONS.USERS_MANAGE),
          },
          {
            path: 'service-groups',
            ...page(
              () => import('@/features/service-groups/pages/service-groups-page'),
              (m) => m.ServiceGroupsPage,
              PERMISSIONS.CLASSES_READ,
            ),
          },
          {
            path: 'departments',
            children: [
              {
                index: true,
                ...page(
                  () => import('@/features/departments/pages/departments-page'),
                  (m) => m.DepartmentsPage,
                  PERMISSIONS.DEPARTMENTS_READ,
                ),
              },
              {
                path: ':id',
                ...page(
                  () => import('@/features/departments/pages/department-detail-page'),
                  (m) => m.DepartmentDetailPage,
                  PERMISSIONS.DEPARTMENTS_READ,
                ),
              },
            ],
          },
          {
            path: 'attendance',
            children: [
              {
                index: true,
                ...page(
                  () => import('@/features/attendance/pages/attendance-page'),
                  (m) => m.AttendancePage,
                  PERMISSIONS.ATTENDANCE_READ,
                ),
              },
              {
                path: ':id',
                ...page(
                  () => import('@/features/attendance/pages/session-page'),
                  (m) => m.SessionPage,
                  PERMISSIONS.ATTENDANCE_READ,
                ),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
