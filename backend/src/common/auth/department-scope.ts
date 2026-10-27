import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

/** The actor's department restriction: null = unrestricted. */
export type DepartmentScope = AuthenticatedUser['departmentIds'];

export function inScope(scope: DepartmentScope, departmentId: number | null | undefined): boolean {
  return scope === null || (departmentId != null && scope.includes(departmentId));
}

/** Throws 403 unless the department is one the actor works in. */
export function assertInScope(
  scope: DepartmentScope,
  departmentId: number | null | undefined,
  message = 'This belongs to a department you are not assigned to.',
): void {
  if (!inScope(scope, departmentId)) throw new ForbiddenException(message);
}

/**
 * Members a department-scoped user may see: those placed in a class their
 * department runs, or serving in their department.
 */
export function memberScopeWhere(scope: DepartmentScope): Prisma.MemberWhereInput {
  if (scope === null) return {};
  return {
    OR: [
      { classEnrollments: { some: { classType: { departmentId: { in: scope } } } } },
      { departmentRoles: { some: { departmentId: { in: scope } } } },
    ],
  };
}
