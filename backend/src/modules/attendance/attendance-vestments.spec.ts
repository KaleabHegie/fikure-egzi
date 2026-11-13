import { jest } from '@jest/globals';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { AttendanceService } from './attendance.service.js';
import type { LatePermissionsService } from './late-permissions/late-permissions.service.js';

type Fn = (...args: unknown[]) => Promise<unknown>;

describe('AttendanceService.setVestment (ልብሰ ስብሐት)', () => {
  const findUnique = jest.fn<Fn>();
  const update = jest.fn<Fn>();
  const service = new AttendanceService(
    { attendanceRecord: { findUnique, update } } as unknown as PrismaService,
    {} as AuditService,
    {} as LatePermissionsService,
  );
  const session = (vestments: boolean) =>
    jest
      .spyOn(service as unknown as { findRow: Fn }, 'findRow')
      .mockResolvedValue({ id: 3, vestments, status: 'CLOSED' });
  const record = (status: string, takenAt: Date | null = null) => ({
    id: 11,
    status,
    checkedInAt: null,
    method: 'MANUAL',
    note: null,
    inRoster: true,
    vestmentTakenAt: takenAt,
    vestmentTakenById: takenAt ? 2 : null,
    vestmentReturnedAt: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    update.mockImplementation((async (a: { data: object }) => ({
      ...record('PRESENT'),
      ...a.data,
    })) as Fn);
  });

  it('notes who took a vestment, even after the session has closed', async () => {
    session(true);
    findUnique.mockResolvedValue(record('LATE'));
    const out = (await service.setVestment(3, 7, 'TAKEN', 5, null)) as {
      vestmentTakenAt: Date | null;
    };
    expect(out.vestmentTakenAt).toBeInstanceOf(Date);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vestmentTakenById: 5, vestmentReturnedAt: null }),
      }),
    );
  });

  it('notes the return', async () => {
    session(true);
    findUnique.mockResolvedValue(record('PRESENT', new Date('2026-11-13T15:00:00Z')));
    await service.setVestment(3, 7, 'RETURNED', 6, null);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vestmentReturnedById: 6 }) }),
    );
  });

  it('needs the member marked present or late, a vestment to return, and a vestment session', async () => {
    session(true);
    findUnique.mockResolvedValue(record('ABSENT'));
    await expect(service.setVestment(3, 7, 'TAKEN', 5, null)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
    findUnique.mockResolvedValue(record('PRESENT'));
    await expect(service.setVestment(3, 7, 'RETURNED', 5, null)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
    session(false);
    await expect(service.setVestment(3, 7, 'TAKEN', 5, null)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
