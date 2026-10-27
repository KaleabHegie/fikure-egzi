import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { FileStorageService } from '../storage/file-storage.service.js';
import { QueryMembersDto } from './dto/query-members.dto.js';
import { formatMemberCode } from './member-code.js';
import { MembersService } from './members.service.js';

// Untyped async mock: tests feed it partial Prisma payloads.
const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function makeQuery(overrides: Partial<QueryMembersDto> = {}): QueryMembersDto {
  return Object.assign(new QueryMembersDto(), overrides);
}

describe('formatMemberCode', () => {
  it('zero-pads the id', () => {
    expect(formatMemberCode(42)).toBe('FE-00042');
    expect(formatMemberCode(123456)).toBe('FE-123456');
  });
});

describe('MembersService', () => {
  const tx = {
    member: { create: asyncMock(), update: asyncMock() },
    memberClassEnrollment: { createMany: asyncMock(), deleteMany: asyncMock() },
    classPlacementHistory: { createMany: asyncMock(), updateMany: asyncMock() },
    departmentServiceHistory: { updateMany: asyncMock() },
  };
  const prisma = {
    classGrade: { findMany: asyncMock() },
    member: {
      findFirst: asyncMock(),
      count: asyncMock(),
      findMany: asyncMock(),
    },
    $transaction: jest.fn<(arg: unknown) => unknown>(),
  };
  const audit = { record: asyncMock() };
  const storage = { save: asyncMock(), remove: asyncMock(), open: asyncMock() };
  const service = new MembersService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    storage as unknown as FileStorageService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as unknown[]),
    );
  });

  describe('buildWhere', () => {
    it('always excludes soft-deleted members', () => {
      expect(service.buildWhere(makeQuery())).toEqual({ deletedAt: null });
    });

    it('requires every search word to match some field', () => {
      const where = service.buildWhere(makeQuery({ search: 'Abebe Kebede', status: 'ACTIVE' }));
      expect(where.status).toBe('ACTIVE');
      expect(where.AND).toHaveLength(2);
      expect((where.AND as { OR: unknown[] }[])[0].OR).toContainEqual({
        firstName: { contains: 'Abebe' },
      });
      expect((where.AND as { OR: unknown[] }[])[1].OR).toContainEqual({
        fatherName: { contains: 'Kebede' },
      });
    });
  });

  describe('findAll', () => {
    it('returns a paginated result', async () => {
      prisma.member.count.mockResolvedValue(45);
      prisma.member.findMany.mockResolvedValue([{ id: 1, classEnrollments: [] }]);

      const result = await service.findAll(makeQuery({ page: 2, pageSize: 20 }));

      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 20,
        total: 45,
        totalPages: 3,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFound for missing or deleted members', async () => {
      prisma.member.findFirst.mockResolvedValue(null);
      await expect(service.findOne(9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('assigns a member code from the id and writes an audit entry', async () => {
      tx.member.create.mockResolvedValue({ id: 7 });
      tx.member.update.mockResolvedValue({ id: 7, memberCode: 'FE-00007', classEnrollments: [] });

      const member = await service.create(
        {
          firstName: 'Abebe',
          fatherName: 'Kebede',
          gender: 'MALE',
          joinedAt: '2024-01-07',
          dateOfBirth: '2005-09-11',
        },
        1,
        '127.0.0.1',
      );

      expect(tx.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            joinedAt: new Date('2024-01-07T00:00:00.000Z'),
            dateOfBirth: new Date('2005-09-11T00:00:00.000Z'),
            createdById: 1,
          }),
        }),
      );
      expect(tx.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: { memberCode: 'FE-00007' },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'Member',
          entityId: 7,
        }),
        tx,
      );
      expect(member.memberCode).toBe('FE-00007');
    });
  });

  it('defaults the join date to today', async () => {
    tx.member.create.mockResolvedValue({ id: 8 });
    tx.member.update.mockResolvedValue({ id: 8, memberCode: 'FE-00008', classEnrollments: [] });

    await service.create(
      { firstName: 'Kidus', fatherName: 'Alemu', gender: 'MALE', dateOfBirth: '2020-02-02' },
      1,
      null,
    );

    expect(tx.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          joinedAt: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
        }),
      }),
    );
  });

  it('requires a date of birth when no section is given', async () => {
    await expect(
      service.create({ firstName: 'A', fatherName: 'B', gender: 'FEMALE' }, 1, null),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  describe('update', () => {
    it('rejects nulling a required field', async () => {
      await expect(
        service.update(1, { firstName: null as unknown as string }, 1, null),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    });
  });

  describe('photos', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    it('rejects files that are not JPEG/PNG/WebP, whatever their name says', async () => {
      prisma.member.findFirst.mockResolvedValue({ id: 3, photoPath: null });
      const svg = Buffer.from('<svg/>');
      await expect(
        service.setPhoto(3, { buffer: svg, size: svg.length }, 1, null),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('stores the new photo, then deletes the previous file', async () => {
      prisma.member.findFirst.mockResolvedValue({ id: 3, photoPath: 'members/3-old.jpg' });
      tx.member.update.mockResolvedValue({
        id: 3,
        photoPath: 'members/3-new.jpg',
        classEnrollments: [],
      });
      Object.assign(tx, { auditLog: {} });

      const member = await service.setPhoto(3, { buffer: jpeg, size: jpeg.length }, 1, null);

      const savedKey = storage.save.mock.calls[0]?.[0] as string;
      expect(savedKey).toMatch(/^members\/3-[0-9a-f]{8}\.jpg$/);
      expect(tx.member.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { photoPath: savedKey, updatedById: 1 } }),
      );
      expect(storage.remove).toHaveBeenCalledWith('members/3-old.jpg');
      expect(member).toMatchObject({ hasPhoto: true });
      expect(member).not.toHaveProperty('photoPath');
    });

    it('removes the new file again if the database update fails', async () => {
      prisma.member.findFirst.mockResolvedValue({ id: 3, photoPath: null });
      tx.member.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.setPhoto(3, { buffer: jpeg, size: jpeg.length }, 1, null),
      ).rejects.toThrow('db down');
      expect(storage.remove).toHaveBeenCalledWith(storage.save.mock.calls[0]?.[0]);
    });
  });

  describe('class placements', () => {
    const grade = (id: number, classTypeId: number, active = true) => ({
      id,
      classTypeId,
      isActive: active,
      classType: { isActive: true },
    });
    const base = {
      firstName: 'A',
      fatherName: 'B',
      gender: 'MALE' as const,
      dateOfBirth: '2015-01-01',
    };
    // No other member has this full name.
    beforeEach(() => prisma.member.findFirst.mockResolvedValue(null));

    it('enrolls the member in the chosen grades on create', async () => {
      prisma.classGrade.findMany.mockResolvedValue([grade(1, 10), grade(20, 11)]);
      tx.member.create.mockResolvedValue({ id: 9 });
      tx.member.update.mockResolvedValue({ id: 9, memberCode: 'FE-00009', classEnrollments: [] });

      await service.create({ ...base, classGradeIds: [1, 20] }, 4, null);

      expect(tx.memberClassEnrollment.createMany).toHaveBeenCalledWith({
        data: [
          { classTypeId: 10, classGradeId: 1, memberId: 9, assignedById: 4 },
          { classTypeId: 11, classGradeId: 20, memberId: 9, assignedById: 4 },
        ],
      });
      expect(tx.classPlacementHistory.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            memberId: 9,
            classTypeId: 10,
            classGradeId: 1,
            recordedById: 4,
          }),
          expect.objectContaining({
            memberId: 9,
            classTypeId: 11,
            classGradeId: 20,
            recordedById: 4,
          }),
        ],
      });
    });

    it('rejects two grades of the same class type', async () => {
      prisma.classGrade.findMany.mockResolvedValue([grade(1, 10), grade(2, 10)]);
      await expect(
        service.create({ ...base, classGradeIds: [1, 2] }, 4, null),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    });

    it('rejects unknown and deactivated grades for new placements', async () => {
      prisma.classGrade.findMany.mockResolvedValue([grade(1, 10, false)]);
      await expect(
        service.create({ ...base, classGradeIds: [1, 99] }, 4, null),
      ).rejects.toMatchObject({
        details: [
          {
            field: 'classGradeIds',
            messages: ['Unknown class grade(s): 99', 'Class grade(s) no longer offered: 1'],
          },
        ],
      });
    });

    it('on update only touches placements that changed', async () => {
      prisma.member.findFirst.mockResolvedValue({
        id: 9,
        classEnrollments: [
          { classType: { id: 10 }, classGrade: { id: 1 } },
          { classType: { id: 11 }, classGrade: { id: 20 } },
        ],
      });
      // Grade 1 was deactivated after this member joined it: keeping it is still allowed.
      prisma.classGrade.findMany.mockResolvedValue([grade(1, 10, false), grade(21, 11)]);
      tx.member.update.mockResolvedValue({ id: 9, classEnrollments: [] });

      await service.update(9, { classGradeIds: [1, 21] }, 4, null);

      expect(tx.memberClassEnrollment.deleteMany).toHaveBeenCalledWith({
        where: { memberId: 9, classTypeId: { in: [11] } },
      });
      expect(tx.memberClassEnrollment.createMany).toHaveBeenCalledWith({
        data: [{ classTypeId: 11, classGradeId: 21, memberId: 9, assignedById: 4 }],
      });
      // Promotion in class type 11: the old period ends, a new one starts; type 10 is untouched.
      expect(tx.classPlacementHistory.updateMany).toHaveBeenCalledWith({
        where: { memberId: 9, endedAt: null, classTypeId: { in: [11] } },
        data: { endedAt: expect.any(Date) },
      });
      expect(tx.classPlacementHistory.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ memberId: 9, classTypeId: 11, classGradeId: 21 })],
      });
    });
  });
});
