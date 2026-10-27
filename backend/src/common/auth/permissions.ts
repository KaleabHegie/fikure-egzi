/**
 * Permission catalog — the single source of truth for RBAC.
 *
 * Authorization always checks permission codes, never role names, so roles
 * can be reshaped without touching code. To add a module:
 *   1. add its codes below,
 *   2. grant them to roles in SYSTEM_ROLES,
 *   3. run `npm run db:seed` (idempotent) to sync the database.
 *
 * Mirror any change in frontend/src/lib/permissions.ts.
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
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  code: PermissionCode;
  module: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  {
    code: PERMISSIONS.MEMBERS_READ,
    module: 'members',
    description: 'View member records',
  },
  {
    code: PERMISSIONS.MEMBERS_CREATE,
    module: 'members',
    description: 'Register new members',
  },
  {
    code: PERMISSIONS.MEMBERS_UPDATE,
    module: 'members',
    description: 'Edit member records',
  },
  {
    code: PERMISSIONS.MEMBERS_DELETE,
    module: 'members',
    description: 'Remove member records',
  },
  {
    code: PERMISSIONS.CLASSES_READ,
    module: 'classes',
    description: 'View class types and grades',
  },
  {
    code: PERMISSIONS.CLASSES_MANAGE,
    module: 'classes',
    description: 'Create and edit class types and grades',
  },
  {
    code: PERMISSIONS.SERVICE_GROUPS_MANAGE,
    module: 'classes',
    description: 'Organise service terms and groups, and assign members to them',
  },
  {
    code: PERMISSIONS.DEPARTMENTS_READ,
    module: 'departments',
    description: 'View departments and who serves in them',
  },
  {
    code: PERMISSIONS.DEPARTMENTS_MANAGE,
    module: 'departments',
    description: 'Create, edit and reorder departments',
  },
  {
    code: PERMISSIONS.DEPARTMENTS_ROSTER,
    module: 'departments',
    description: 'Assign members to departments and set their roles',
  },
  {
    code: PERMISSIONS.ATTENDANCE_READ,
    module: 'attendance',
    description: 'View attendance sessions and reports',
  },
  {
    code: PERMISSIONS.ATTENDANCE_TAKE,
    module: 'attendance',
    description: 'Record attendance (scan QR codes, mark the roster)',
  },
  {
    code: PERMISSIONS.ATTENDANCE_MANAGE,
    module: 'attendance',
    description: 'Create, edit, close and reopen attendance sessions',
  },
  {
    code: PERMISSIONS.ATTENDANCE_DELETE,
    module: 'attendance',
    description: 'Delete attendance sessions',
  },
  {
    code: PERMISSIONS.ATTENDANCE_ANY_DAY,
    module: 'attendance',
    description:
      "Create and change attendance for days other than today (without it: today's only)",
  },
  {
    code: PERMISSIONS.ASSETS_READ,
    module: 'assets',
    description: 'View assets and their photos',
  },
  {
    code: PERMISSIONS.ASSETS_MANAGE,
    module: 'assets',
    description: 'Register, edit and remove assets',
  },
  {
    code: PERMISSIONS.COURSES_READ,
    module: 'courses',
    description: 'View courses, their runs and marks (teachers: only their own runs)',
  },
  {
    code: PERMISSIONS.COURSES_MANAGE,
    module: 'courses',
    description: 'Register courses, schedule runs and assign teachers',
  },
  {
    code: PERMISSIONS.COURSES_TEACH,
    module: 'courses',
    description: 'Set up assessments and enter student marks',
  },
  {
    code: PERMISSIONS.USERS_MANAGE,
    module: 'users',
    description: 'Manage system user accounts',
  },
  {
    code: PERMISSIONS.ROLES_MANAGE,
    module: 'roles',
    description: 'Manage roles and permissions',
  },
  {
    code: PERMISSIONS.AUDIT_READ,
    module: 'audit',
    description: 'View the audit trail',
  },
];

export interface SystemRoleDefinition {
  code: string;
  name: string;
  description: string;
  /** Holders act only within the departments assigned to them. */
  departmentScoped: boolean;
  permissions: readonly PermissionCode[];
}

const ALL_PERMISSIONS = PERMISSION_DEFINITIONS.map((p) => p.code);

/**
 * The three kinds of user. Department-scoped roles see and act on only their
 * assigned departments: their rosters, and the attendance of the classes and
 * sessions those departments run.
 */
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Office administrator',
    description: 'ፅህፈት ቤት — full access to every module and every department',
    departmentScoped: false,
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'DEPARTMENT_ADMIN',
    name: 'Department administrator',
    description:
      'Runs their department(s): roster, classes and service groups, attendance, courses, attendance takers and teachers',
    departmentScoped: true,
    permissions: [
      PERMISSIONS.MEMBERS_READ,
      PERMISSIONS.CLASSES_READ,
      PERMISSIONS.DEPARTMENTS_READ,
      PERMISSIONS.CLASSES_MANAGE,
      PERMISSIONS.DEPARTMENTS_ROSTER,
      PERMISSIONS.SERVICE_GROUPS_MANAGE,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_TAKE,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ATTENDANCE_DELETE,
      PERMISSIONS.ATTENDANCE_ANY_DAY,
      PERMISSIONS.ASSETS_READ,
      PERMISSIONS.ASSETS_MANAGE,
      PERMISSIONS.COURSES_READ,
      PERMISSIONS.COURSES_MANAGE,
      PERMISSIONS.COURSES_TEACH,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  {
    code: 'ATTENDANCE_TAKER',
    name: 'Attendance taker',
    description: "Only the attendance page: today's attendance of their department(s)",
    departmentScoped: true,
    permissions: [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_TAKE,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ATTENDANCE_DELETE,
    ],
  },
  {
    code: 'TEACHER',
    name: 'Teacher',
    description: 'A member who teaches: their own course runs, assessments and marks',
    departmentScoped: true,
    permissions: [PERMISSIONS.COURSES_READ, PERMISSIONS.COURSES_TEACH],
  },
];
