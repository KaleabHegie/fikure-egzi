import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { ExamsService } from './exams.service.js';

// Untyped async mock: tests feed it partial Prisma payloads.
const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const office = { id: 1, departmentIds: null } as unknown as AuthenticatedUser;
const mezmurAdmin = { id: 2, departmentIds: [4] } as unknown as AuthenticatedUser;

/** An exam row as the service selects it: እንቅስቃሴ 40 / ዜማ 60, pass mark 60. */
const examRow = (over: Record<string, unknown> = {}) => ({
  id: 9,
  classTypeId: 1,
  classGradeId: null,
  nameAm: 'የቅዱስ ዮሐንስ ወረብ መመዘኛ',
  nameEn: null,
  description: null,
  heldOn: null,
  passMark: 60,
  createdAt: new Date(),
  updatedAt: new Date(),
  classType: {
    id: 1,
    nameAm: 'የመዝሙር ክፍል',
    nameEn: 'Mezmur class',
    departmentId: 4,
    department: { id: 4, nameAm: 'የመዝሙር እና በዓላት ዝግጅት ክፍል', nameEn: 'Mezmur' },
  },
  classGrade: null,
  parts: [
    { id: 1, name: 'እንቅስቃሴ', weight: 40, sortOrder: 0 },
    { id: 2, name: 'ዜማ', weight: 60, sortOrder: 1 },
  ],
  _count: { candidates: 3 },
  ...over,
});

const member = (id: number, firstName: string) => ({
  id,
  memberCode: `FE-0000${id}`,
  firstName,
  fatherName: 'Kebede',
  grandfatherName: null,
  christianName: null,
  photoPath: null,
  updatedAt: new Date(),
});

describe('ExamsService', () => {
  const prisma = {
    exam: { findMany: asyncMock(), findFirst: asyncMock(), create: asyncMock() },
    classType: { findUnique: asyncMock() },
    member: { findMany: asyncMock() },
    examMark: { findMany: asyncMock(), count: asyncMock() },
    examCandidate: { findMany: asyncMock(), createMany: asyncMock() },
    department: { count: asyncMock() },
    $transaction: jest.fn<(arg: unknown) => unknown>(),
  };
  const audit = { record: asyncMock() };
  const service = new ExamsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.examMark.findMany.mockResolvedValue([]);
    prisma.department.count.mockResolvedValue(1);
    // The Mezmur class (run by department 4) with its Geez and Ezel levels.
    prisma.classType.findUnique.mockResolvedValue({
      departmentId: 4,
      grades: [{ id: 11 }, { id: 12 }],
    });
    prisma.$transaction.mockImplementation((arg) =>
      Array.isArray(arg) ? Promise.all(arg as Promise<unknown>[]) : (arg as () => unknown)(),
    );
  });

  it('keeps a department admin to the exams of the classes their department runs', async () => {
    prisma.exam.findMany.mockResolvedValue([]);
    await service.list({}, mezmurAdmin);
    expect(prisma.exam.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { classType: { departmentId: { in: [4] } } },
    });

    // The Course class is run by department 2, not theirs.
    prisma.classType.findUnique.mockResolvedValueOnce({ departmentId: 2, grades: [] });
    await expect(
      service.create({ classTypeId: 2, nameAm: 'ፈተና' }, mezmurAdmin),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Another department's exam is simply not found for them.
    prisma.exam.findFirst.mockResolvedValue(null);
    await expect(service.findOne(9, mezmurAdmin)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.exam.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 9, classType: { departmentId: { in: [4] } } },
    });
  });

  it("refuses a level that is not one of the class's levels", async () => {
    await expect(
      service.create({ classTypeId: 1, classGradeId: 99, nameAm: 'ፈተና' }, office),
    ).rejects.toMatchObject({ details: [{ messages: ['exams.levelOutsideClass'] }] });
  });

  it('starts with everyone in the chosen level as candidates', async () => {
    const tx = {
      exam: { create: asyncMock().mockResolvedValue({ id: 9 }) },
      member: { findMany: asyncMock().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
      examCandidate: { createMany: asyncMock().mockResolvedValue({ count: 2 }) },
    };
    prisma.$transaction.mockImplementation((arg) =>
      typeof arg === 'function'
        ? (arg as (t: unknown) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    );
    prisma.exam.findFirst.mockResolvedValue(examRow());
    await service.create({ classTypeId: 1, classGradeId: 12, nameAm: 'ፈተና' }, office);
    expect(tx.member.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { classEnrollments: { some: { classGradeId: 12 } } },
    });
    expect(tx.examCandidate.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [
        { examId: 9, memberId: 1 },
        { examId: 9, memberId: 2 },
      ],
    });
  });

  it('refuses parts whose weights add up to more than 100, or repeat a name', async () => {
    const over = service.create(
      {
        classTypeId: 1,
        nameAm: 'ፈተና',
        parts: [
          { name: 'እንቅስቃሴ', weight: 50 },
          { name: 'ዜማ', weight: 60 },
        ],
      },
      office,
    );
    await expect(over).rejects.toBeInstanceOf(ValidationFailedException);
    await expect(over).rejects.toMatchObject({
      details: [{ messages: ['exams.totalOver|{"total":110}'] }],
    });

    const twice = service.create(
      {
        classTypeId: 1,
        nameAm: 'ፈተና',
        parts: [
          { name: 'ዜማ', weight: 40 },
          { name: 'ዜማ', weight: 60 },
        ],
      },
      office,
    );
    await expect(twice).rejects.toMatchObject({ details: [{ messages: ['exams.duplicatePart'] }] });
  });

  it('gives a result only once every part is marked, against the pass mark', async () => {
    prisma.exam.findFirst.mockResolvedValue(examRow());
    prisma.examCandidate.findMany.mockResolvedValue([
      { member: member(1, 'Abebe') },
      { member: member(2, 'Bereket') },
      { member: member(3, 'Chaltu') },
    ]);
    // Progress (findOne) reads marks first, then the sheet reads them.
    const marks = [
      { partId: 1, memberId: 1, score: 35 },
      { partId: 2, memberId: 1, score: 50 },
      { partId: 1, memberId: 2, score: 20 },
      { partId: 2, memberId: 2, score: 30 },
      { partId: 1, memberId: 3, score: 38.5 },
    ];
    prisma.examMark.findMany.mockResolvedValue(marks);

    const { exam, candidates } = await service.sheet(9, office);
    expect(exam).toMatchObject({ totalWeight: 100, markedCount: 2, passedCount: 1 });
    expect(candidates.map((c) => [c.member.firstName, c.total, c.result])).toEqual([
      ['Abebe', 85, 'PASS'],
      ['Bereket', 50, 'FAIL'],
      ['Chaltu', 38.5, null],
    ]);
  });

  it('has no result while the weights add up to less than 100', async () => {
    prisma.exam.findFirst.mockResolvedValue(
      examRow({ parts: [{ id: 1, name: 'እንቅስቃሴ', weight: 40, sortOrder: 0 }] }),
    );
    prisma.examCandidate.findMany.mockResolvedValue([{ member: member(1, 'Abebe') }]);
    prisma.examMark.findMany.mockResolvedValue([{ partId: 1, memberId: 1, score: 40 }]);
    const { candidates } = await service.sheet(9, office);
    expect(candidates[0]).toMatchObject({ total: 40, result: null });
  });

  it("refuses a mark above the part's weight, or for someone not sitting the exam", async () => {
    prisma.exam.findFirst.mockResolvedValue(examRow());
    prisma.examCandidate.findMany.mockResolvedValue([{ memberId: 1 }]);
    await expect(
      service.setMarks(9, { marks: [{ partId: 1, memberId: 1, score: 45 }] }, office),
    ).rejects.toMatchObject({ details: [{ messages: ['exams.scoreOverWeight|{"max":40}'] }] });
    await expect(
      service.setMarks(9, { marks: [{ partId: 1, memberId: 7, score: 10 }] }, office),
    ).rejects.toMatchObject({ details: [{ messages: ['exams.notCandidate'] }] });
  });
});
