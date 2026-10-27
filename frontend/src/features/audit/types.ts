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
  'MemberPortal',
  'User',
] as const
export type AuditEntity = (typeof AUDIT_ENTITIES)[number]

export interface AuditUser {
  id: number
  fullName: string
  email: string
}

export interface AuditEntry {
  id: string
  userId: number | null
  user: AuditUser | null
  action: AuditAction
  entity: string
  entityId: string | null
  changes: unknown
  ipAddress: string | null
  createdAt: string
}

export interface AuditQuery {
  page: number
  pageSize: number
  userId?: number
  entity?: string
  action?: string
  from?: string
  to?: string
}
