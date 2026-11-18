export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** Things the API records changes to (AuditService `entity`). */
export const AUDIT_ENTITIES = [
  'Member',
  'MemberImport',
  'ClassType',
  'ClassGrade',
  'Department',
  'DepartmentMembership',
  'ServiceTerm',
  'ServiceGroup',
  'AttendanceSession',
  'AttendanceImport',
  'Asset',
  'AssetCategory',
  'MemberPortal',
  'LatePermission',
  'ClassAgreement',
  'Course',
  'CourseOffering',
  'Exam',
  'Settings',
  'User',
] as const
export type AuditEntity = (typeof AUDIT_ENTITIES)[number]

export interface AuditUser {
  id: number
  fullName: string
  email: string
}

/** The record an entry is about, in words (missing once the record is deleted). */
export interface AuditTarget {
  am: string
  en: string
  /** Member ID, asset code, email or date that identifies it at a glance. */
  code: string | null
}

export interface AuditEntry {
  id: string
  userId: number | null
  user: AuditUser | null
  action: AuditAction
  entity: string
  entityId: string | null
  target: AuditTarget | null
  changes: unknown
  ipAddress: string | null
  createdAt: string
}

export interface AuditQuery {
  page: number
  pageSize: number
  search?: string
  userId?: number
  entity?: string
  action?: string
  from?: string
  to?: string
}
