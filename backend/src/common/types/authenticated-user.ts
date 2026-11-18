import type { PermissionCode } from '../auth/permissions.js';

/** The principal attached to `request.user` after JWT validation. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
  roles: string[];
  permissions: PermissionCode[];
  /**
   * Departments the user may act in, or null when unrestricted (office
   * administrators). Department-scoped roles never see or change anything
   * belonging to other departments.
   */
  departmentIds: number[] | null;
  /** Assigned to the ፅህፈት ቤት (the secretariat), which oversees every department's work. */
  inOffice: boolean;
}

export interface JwtPayload {
  sub: number;
  email: string;
}
