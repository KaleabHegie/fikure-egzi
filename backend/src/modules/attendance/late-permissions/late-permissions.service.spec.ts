import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ValidationFailedException } from '../../../common/filters/all-exceptions.filter.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { FileStorageService } from '../../storage/file-storage.service.js';
import type { CreateLatePermissionDto } from './late-permission.dto.js';
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
  const dto: CreateLatePermissionDto = {
    memberId: 7,
    departmentId: 4,
    type: 'LATE_ARRIVAL',
    graceMinutes: 30,
    weekdays: [0],
    startsOn: '2026-09-11',
    endsOn: '2027-01-31',
    reason: 'Works until 8:30 on Sundays',
    requestedOn: '2026-09-10',
    decision: 'APPROVED',
  };
  // A Sunday-morning class, 8:00–11:00.
  const sunday = { date: '2026-11-08', start: '08:00', end: '11:00' };
  const row = (r: Record<string, unknown>) => ({
    code: `PRM-0000${String(r.memberId)}`,
    graceMinutes: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    fromTime: null,
    toTime: null,
    ...r,
  });

  beforeEach(() => jest.clearAllMocks());

  it('gives each member the longest late-arrival grace covering that weekday', async () => {
    findMany.mockResolvedValue([
      row({ memberId: 7, type: 'LATE_ARRIVAL', graceMinutes: 20, weekdays: [0, 6] }),
      row({ memberId: 7, type: 'LATE_ARRIVAL', graceMinutes: 30, weekdays: [0] }),
      row({ memberId: 8, type: 'LATE_ARRIVAL', graceMinutes: 40, weekdays: [6] }), // Saturdays only
    ]);
    const covers = await service.coverOn(4, sunday, {});
    expect(covers.get(7)?.graceMinutes).toBe(30);
    expect(covers.has(8)).toBe(false);
    // Only the department's own, approved, unrevoked permissions in force that day are asked for.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 4, decision: 'APPROVED', revokedAt: null }),
      }),
    );
  });

  it('excuses absence types and records leaving early', async () => {
    findMany.mockResolvedValue([
      row({ memberId: 7, code: 'PRM-00007', type: 'SICK_LEAVE' }),
      row({
        memberId: 8,
        code: 'PRM-00008',
        type: 'LEAVE_EARLY',
        fromTime: '10:00',
        toTime: '11:00',
      }),
    ]);
    const covers = await service.coverOn(4, sunday, {});
    expect(covers.get(7)?.excuse).toEqual({ code: 'PRM-00007', type: 'SICK_LEAVE' });
    expect(covers.get(8)?.leaveEarly).toEqual({ code: 'PRM-00008', fromTime: '10:00' });
    expect(covers.get(8)?.excuse).toBeNull();
  });

  it('skips a permission whose time window does not overlap the session', async () => {
    findMany.mockResolvedValue([
      row({ memberId: 7, type: 'MISS_STUDY', fromTime: '14:00', toTime: '16:00' }),
      row({ memberId: 8, type: 'MISS_STUDY', fromTime: '09:00', toTime: '10:00' }),
    ]);
    const covers = await service.coverOn(4, sunday, {});
    expect(covers.has(7)).toBe(false);
    expect(covers.get(8)?.excuse?.type).toBe('MISS_STUDY');
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

  it('checks the form: dates, late-arrival minutes, "other" text and the time window', async () => {
    classTypeCount.mockResolvedValue(1);
    memberCount.mockResolvedValue(1);
    const invalid: Partial<CreateLatePermissionDto>[] = [
      { startsOn: '2027-02-01' },
      { graceMinutes: null },
      { type: 'OTHER', typeOther: null },
      { fromTime: '09:00', toTime: null },
      { fromTime: '10:00', toTime: '09:00' },
    ];
    for (const change of invalid) {
      await expect(service.create({ ...dto, ...change }, 1, null)).rejects.toBeInstanceOf(
        ValidationFailedException,
      );
    }
  });

  it('tells pending, rejected, upcoming, active and ended permissions apart', () => {
    const p = (
      startsOn: string,
      endsOn: string,
      decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO' = 'APPROVED',
      revokedAt: Date | null = null,
    ) => ({
      startsOn: new Date(`${startsOn}T00:00:00Z`),
      endsOn: new Date(`${endsOn}T00:00:00Z`),
      revokedAt,
      decision,
    });
    const today = '2026-11-10';
    expect(permissionState(p('2026-12-01', '2027-01-01'), today)).toBe('upcoming');
    expect(permissionState(p('2026-11-01', '2026-11-10'), today)).toBe('active');
    expect(permissionState(p('2026-10-01', '2026-11-09'), today)).toBe('ended');
    expect(permissionState(p('2026-11-01', '2027-01-01', 'APPROVED', new Date()), today)).toBe(
      'ended',
    );
    expect(permissionState(p('2026-11-01', '2027-01-01', 'NEEDS_INFO'), today)).toBe('pending');
    expect(permissionState(p('2026-11-01', '2027-01-01', 'REJECTED'), today)).toBe('rejected');
  });
});
