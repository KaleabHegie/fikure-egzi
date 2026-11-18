import { jest } from '@jest/globals';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuditLogService } from './audit-log.service.js';
import type { QueryAuditDto } from './dto/query-audit.dto.js';

const rows = (...ids: number[]) =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(ids.map((id) => ({ id })));
const none = () => rows();

describe('AuditLogService visibility', () => {
  const prisma = {
    member: { findMany: rows(12, 13) },
    attendanceSession: { findMany: rows(7) },
    exam: { findMany: rows(4) },
    classType: { findMany: rows(1) },
    classGrade: { findMany: none() },
    classAgreement: { findMany: none() },
    departmentMembership: { findMany: none() },
    latePermission: { findMany: none() },
    asset: { findMany: none() },
    course: { findMany: none() },
    courseOffering: { findMany: none() },
    auditLog: {
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(0),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]),
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const service = new AuditLogService(prisma as unknown as PrismaService);
  const q = { page: 1, pageSize: 25, skip: 0, sortOrder: 'desc' } as unknown as QueryAuditDto;
  const where = () => {
    const call = prisma.auditLog.findMany.mock.calls.at(-1);
    if (!call) throw new Error('auditLog.findMany was not called');
    return (call[0] as { where: { AND: unknown[] } }).where.AND[0];
  };

  it('shows office administrators everything', async () => {
    await service.list(q, { id: 1, departmentIds: null } as AuthenticatedUser);
    expect(where()).toEqual({});
  });

  it("shows a department head their staff's actions and changes to their own records only", async () => {
    await service.list(q, { id: 2, departmentIds: [4, 9] } as AuthenticatedUser);
    expect(where()).toEqual({
      OR: [
        {
          user: {
            OR: [{ id: 2 }, { departments: { some: {}, every: { departmentId: { in: [4, 9] } } } }],
          },
        },
        {
          OR: [
            { entity: { in: ['Member', 'MemberPortal'] }, entityId: { in: ['12', '13'] } },
            { entity: { in: ['AttendanceSession'] }, entityId: { in: ['7'] } },
            { entity: { in: ['Exam'] }, entityId: { in: ['4'] } },
            { entity: { in: ['ClassType'] }, entityId: { in: ['1'] } },
            { entity: { in: ['Department'] }, entityId: { in: ['4', '9'] } },
          ],
        },
      ],
    });
    // Records are looked up within their departments only.
    expect(prisma.exam.findMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { classType: { departmentId: { in: [4, 9] } } },
    });
  });
});
