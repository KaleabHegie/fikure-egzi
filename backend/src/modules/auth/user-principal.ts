import type { PermissionCode } from '../../common/auth/permissions.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Prisma include that loads everything needed to build an AuthenticatedUser. */
/** Sub-departments down to three levels below an assigned department (sections included). */
const CHILDREN = {
  select: { id: true, children: { select: { id: true, children: { select: { id: true } } } } },
} as const;

export const USER_WITH_ACCESS = {
  departments: {
    select: { departmentId: true, department: { select: { children: CHILDREN } } },
  },
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{
  include: typeof USER_WITH_ACCESS;
}>;

type Child = { id: number; children?: Child[] };
const descendants = (children: Child[] | undefined): number[] =>
  (children ?? []).flatMap((c) => [c.id, ...descendants(c.children)]);

export function toAuthenticatedUser(user: UserWithAccess): AuthenticatedUser {
  const permissions = new Set<PermissionCode>();
  for (const { role } of user.roles) {
    for (const { permission } of role.permissions) {
      permissions.add(permission.code as PermissionCode);
    }
  }
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map(({ role }) => role.code),
    permissions: [...permissions].sort(),
    // Any unscoped role (e.g. office administrator) lifts the department restriction.
    // A department's admin also looks after its sub-departments and their sections.
    departmentIds:
      user.roles.length > 0 && user.roles.every(({ role }) => role.departmentScoped)
        ? [
            ...new Set(
              user.departments.flatMap((d) => [
                d.departmentId,
                ...descendants(d.department?.children),
              ]),
            ),
          ].sort((a, b) => a - b)
        : null,
  };
}
