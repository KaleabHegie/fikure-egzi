import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
import type { PermissionCode } from '../auth/permissions.js';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** A permission, or a group of which any one is enough (see anyOf). */
export type PermissionRequirement = PermissionCode | readonly PermissionCode[];

/** Satisfied by holding any one of the listed permissions. */
export const anyOf = (...permissions: PermissionCode[]): readonly PermissionCode[] => permissions;

/**
 * Requires the caller to satisfy ALL listed requirements; an anyOf() group
 * is satisfied by any one of its permissions.
 */
export const RequirePermissions = (...requirements: PermissionRequirement[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, requirements),
    ApiBearerAuth(),
    ApiForbiddenResponse({
      description: `Requires: ${requirements
        .map((r) => (typeof r === 'string' ? r : `one of (${r.join(' | ')})`))
        .join(', ')}`,
    }),
  );
