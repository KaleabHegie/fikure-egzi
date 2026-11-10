import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ValidationFailedException } from '../../../common/filters/all-exceptions.filter.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { FileStorageService } from '../../storage/file-storage.service.js';
import { LatePermissionsService, permissionState } from './late-permissions.service.js';

type Fn = (...args: unknown[]) => Promise<unknown>;

describe('LatePermissionsService', () => {
  const findMany = jest.fn<Fn>();
  const memberCount = jest.fn<Fn>();
  const classTypeCount = jest.fn<Fn>();
  const create = jest.fn<Fn>();
  const prisma = {
    latePermission: { findMany, create },
    member: { count: memberCount },
    classType: { count: classTypeCount },
  };
  const service = new LatePermissionsService(
    prisma as unknown as PrismaService,
    { record: jest.fn<Fn>() } as unknown as AuditService,
    {} as FileStorageService,
  );
  const dto = {
    memberId: 7,
    departmentId: 4,
    graceMinutes: 30,
    weekdays: [0],
    startsOn: '2026-09-11',
    endsOn: '2027-01-31',
    reason: 'Works until 8:30 on Sundays',
  };

  beforeEach(() => jest.clearAllMocks());

  it('gives each member the longest grace among permissions covering that weekday', async () => {
    findMany.mockResolvedValue([
      { memberId: 7, graceMinutes: 20, weekdays: [0, 6] },
      { memberId: 7, graceMinutes: 30, weekdays: [0] },
      { memberId: 8, graceMinutes: 40, weekdays: [6] }, // Saturdays only
    ]);
    const grace = await service.graceOn(4, '2026-11-08', {}); // a Sunday
    expect([...grace]).toEqual([[7, 30]]);
    // Only the department's own, unrevoked permissions in force that day are asked for.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 4, revokedAt: null }),
      }),
    );
  });

  it('refuses a department the user does not run', async () => {
    await expect(service.create(dto, 1, [9])).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a member who is not in that department’s classes or service groups', async () => {
    classTypeCount.mockResolvedValue(1);
    memberCount.mockResolvedValue(0);
    await expect(service.create(dto, 1, [4])).rejects.toBeInstanceOf(ValidationFailedException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an end date before the start', async () => {
    classTypeCount.mockResolvedValue(1);
    memberCount.mockResolvedValue(1);
    await expect(
      service.create({ ...dto, startsOn: '2027-02-01' }, 1, null),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('tells upcoming, active and ended permissions apart', () => {
    const p = (startsOn: string, endsOn: string, revokedAt: Date | null = null) => ({
      startsOn: new Date(`${startsOn}T00:00:00Z`),
      endsOn: new Date(`${endsOn}T00:00:00Z`),
      revokedAt,
    });
    expect(permissionState(p('2026-12-01', '2027-01-01'), '2026-11-10')).toBe('upcoming');
    expect(permissionState(p('2026-11-01', '2026-11-10'), '2026-11-10')).toBe('active');
    expect(permissionState(p('2026-10-01', '2026-11-09'), '2026-11-10')).toBe('ended');
    expect(permissionState(p('2026-11-01', '2027-01-01', new Date()), '2026-11-10')).toBe('ended');
  });
});
