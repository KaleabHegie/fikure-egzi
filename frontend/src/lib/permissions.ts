/**
 * Mirror of backend/src/common/auth/permissions.ts. The API is the real
 * gatekeeper; the UI uses these only to hide actions a user cannot perform.
 */
export const PERMISSIONS = {
  MEMBERS_READ: 'members.read',
  MEMBERS_CREATE: 'members.create',
  MEMBERS_UPDATE: 'members.update',
  MEMBERS_DELETE: 'members.delete',
  CLASSES_READ: 'classes.read',
  CLASSES_MANAGE: 'classes.manage',
  SERVICE_GROUPS_MANAGE: 'service_groups.manage',
  DEPARTMENTS_READ: 'departments.read',
  DEPARTMENTS_MANAGE: 'departments.manage',
  DEPARTMENTS_ROSTER: 'departments.roster',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_TAKE: 'attendance.take',
  ATTENDANCE_MANAGE: 'attendance.manage',
  ATTENDANCE_DELETE: 'attendance.delete',
  ATTENDANCE_ANY_DAY: 'attendance.any_day',
  ASSETS_READ: 'assets.read',
  ASSETS_MANAGE: 'assets.manage',
  COURSES_READ: 'courses.read',
  COURSES_MANAGE: 'courses.manage',
  COURSES_TEACH: 'courses.teach',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
