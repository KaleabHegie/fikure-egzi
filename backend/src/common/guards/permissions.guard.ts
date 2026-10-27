import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

/** Global guard: enforces @RequirePermissions() metadata. Runs after JwtAuthGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionRequirement[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    const granted = new Set(user?.permissions ?? []);
    const missing = required.filter((r) =>
      typeof r === 'string' ? !granted.has(r) : !r.some((p) => granted.has(p)),
    );
    if (missing.length > 0) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
