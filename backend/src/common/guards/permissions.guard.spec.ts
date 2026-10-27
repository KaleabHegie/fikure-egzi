import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '../auth/permissions.js';
import { PermissionsGuard } from './permissions.guard.js';

function contextFor(permissions: string[] | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: permissions ? { permissions } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  it('allows routes without permission metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor([]))).toBe(true);
  });

  it('allows a user holding every required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PERMISSIONS.MEMBERS_READ]);
    expect(guard.canActivate(contextFor([PERMISSIONS.MEMBERS_READ]))).toBe(true);
  });

  it('rejects a user missing a required permission', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([PERMISSIONS.MEMBERS_READ, PERMISSIONS.MEMBERS_DELETE]);
    expect(() => guard.canActivate(contextFor([PERMISSIONS.MEMBERS_READ]))).toThrow(
      ForbiddenException,
    );
  });

  it('accepts any one permission of an anyOf group', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([[PERMISSIONS.CLASSES_READ, PERMISSIONS.ATTENDANCE_MANAGE]]);
    expect(guard.canActivate(contextFor([PERMISSIONS.ATTENDANCE_MANAGE]))).toBe(true);
    expect(() => guard.canActivate(contextFor([PERMISSIONS.MEMBERS_READ]))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects anonymous requests on protected routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PERMISSIONS.MEMBERS_READ]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
