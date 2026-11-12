import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { UsersService } from './users.service.js';

type Fn = (...args: unknown[]) => Promise<unknown>;

describe('UsersService.remove', () => {
  const findFirst = jest.fn<Fn>();
  const count = jest.fn<Fn>();
  const deleteUser = jest.fn<Fn>();
  const deleteLogs = jest.fn<Fn>();
  const tx = { auditLog: { deleteMany: deleteLogs }, user: { delete: deleteUser } };
  const prisma = {
    user: { findFirst, count },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  };
  const record = jest.fn<Fn>();
  const service = new UsersService(
    prisma as unknown as PrismaService,
    { record } as unknown as AuditService,
    {} as AppConfigService,
  );
  const officeAdmin = { id: 1, departmentIds: null } as unknown as AuthenticatedUser;
  const account = (code: string) => ({
    id: 7,
    email: 'taker@example.com',
    fullName: 'Abebe Kebede',
    isActive: true,
    roles: [{ role: { code } }],
    departments: [],
    member: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    deleteLogs.mockResolvedValue({ count: 12 });
  });

  it('deletes the account and every audit entry it made, then records the deletion', async () => {
    findFirst.mockResolvedValue(account('ATTENDANCE_TAKER'));

    await expect(service.remove(7, officeAdmin)).resolves.toEqual({ auditLogsDeleted: 12 });

    expect(deleteLogs).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        action: 'DELETE',
        entity: 'User',
        entityId: 7,
        changes: expect.objectContaining({ email: 'taker@example.com', auditLogsDeleted: 12 }),
      }),
    );
  });

  it('refuses to delete your own account', async () => {
    findFirst.mockResolvedValue({ ...account('SUPER_ADMIN'), id: 1 });
    await expect(service.remove(1, officeAdmin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the last active office administrator', async () => {
    findFirst.mockResolvedValue(account('SUPER_ADMIN'));
    count.mockResolvedValue(0);
    await expect(service.remove(7, officeAdmin)).rejects.toBeInstanceOf(ConflictException);
    expect(deleteLogs).not.toHaveBeenCalled();
  });

  it('deletes an office administrator when another one remains', async () => {
    findFirst.mockResolvedValue(account('SUPER_ADMIN'));
    count.mockResolvedValue(1);
    await service.remove(7, officeAdmin);
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});

describe('UsersService.create', () => {
  const create = jest.fn<Fn>();
  const prisma = {
    role: {
      findUnique: jest.fn<Fn>().mockResolvedValue({
        id: 3,
        code: 'OFFICE_ADMIN',
        departmentScoped: false,
      }),
    },
    user: { count: jest.fn<Fn>().mockResolvedValue(0), create },
    member: { findFirst: jest.fn<Fn>() },
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    { record: jest.fn<Fn>() } as unknown as AuditService,
    { auth: { bcryptRounds: 4 } } as unknown as AppConfigService,
  );
  const officeAdmin = { id: 1, departmentIds: null } as unknown as AuthenticatedUser;
  const dto = {
    fullName: 'Hanna Girma',
    email: 'hanna@example.com',
    password: 'Secret123!',
    roleCode: 'OFFICE_ADMIN',
  };

  it('refuses an account that is not made from a member, whatever its role', async () => {
    await expect(service.create(dto, officeAdmin)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a member who already has a login', async () => {
    prisma.member.findFirst.mockResolvedValue({ id: 9, user: { id: 2 } });
    await expect(service.create({ ...dto, memberId: 9 }, officeAdmin)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
    expect(create).not.toHaveBeenCalled();
  });
});
