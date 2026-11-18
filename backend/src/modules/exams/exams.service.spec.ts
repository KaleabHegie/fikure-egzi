import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { ExamsService } from './exams.service.js';

// Untyped async mock: tests feed it partial Prisma payloads.
const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const actor = (id: number, departmentIds: number[] | null, more: object = {}) =>
  ({
    id,
    departmentIds,
    permissions: [],
    inOffice: false,
    ...more,
  }) as unknown as AuthenticatedUser;
const office = actor(1, null);
/** Created the exams in these tests (as an exam taker would). */
const mezmurAdmin = actor(2, [4]);

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
  createdById: 2,
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
    exam: {
      findMany: asyncMock(),
      findFirst: asyncMock(),
      create: asyncMock(),
      update: asyncMock(),
    },
    classType: { findUnique: asyncMock() },
    member: { findMany: asyncMock() },
    examMark: { findMany: asyncMock(), count: asyncMock(), upsert: asyncMock() },
    examCandidate: { findMany: asyncMock(), createMany: asyncMock(), updateMany: asyncMock() },
    examGroup: { findMany: asyncMock(), create: asyncMock(), deleteMany: asyncMock() },
    user: { findMany: asyncMock() },
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
    prisma.examGroup.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.department.count.mockResolvedValue(1);
    // The Mezmur class (run by department 4) with its Geez and Ezel levels.
    prisma.classType.findUnique.mockResolvedValue({
      departmentId: 4,
      grades: [{ id: 11 }, { id: 12 }],
    });
    prisma.$transaction.mockImplementation((arg) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (tx: unknown) => unknown)(prisma),
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

  it('numbers the groups marked together in order, leaving out ones nobody is in any more', async () => {
    prisma.exam.findFirst.mockResolvedValue(examRow());
    prisma.examCandidate.findMany.mockResolvedValue([
      { groupId: 30, member: member(1, 'Abebe') },
      { groupId: 30, member: member(2, 'Bereket') },
      { groupId: null, member: member(3, 'Chaltu') },
    ]);
    const at = new Date('2026-11-18T08:00:00Z');
    prisma.examGroup.findMany.mockResolvedValue([
      { id: 20, createdAt: at, createdById: 2 },
      { id: 30, createdAt: at, createdById: 2 },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 2, fullName: 'Exam Taker' }]);
    const { candidates, groups } = await service.sheet(9, office);
    expect(groups).toEqual([
      { id: 30, number: 1, createdAt: at, createdBy: 'Exam Taker', memberIds: [1, 2] },
    ]);
    expect(candidates.map((c) => c.groupId)).toEqual([30, 30, null]);
  });

  it('records a group marked together, and refuses one with someone not sitting the exam', async () => {
    prisma.exam.findFirst.mockResolvedValue(examRow());
    prisma.examCandidate.findMany.mockResolvedValueOnce([{ memberId: 1 }]);
    await expect(
      service.setMarks(9, { marks: [], groups: [{ memberIds: [1, 7] }] }, office),
    ).rejects.toMatchObject({ details: [{ messages: ['exams.notCandidate'] }] });

    prisma.examCandidate.findMany.mockResolvedValueOnce([{ memberId: 1 }, { memberId: 2 }]);
    prisma.examGroup.create.mockResolvedValue({ id: 40 });
    await service.setMarks(
      9,
      { marks: [{ partId: 1, memberId: 1, score: 30 }], groups: [{ memberIds: [1, 2] }] },
      office,
    );
    expect(prisma.examCandidate.updateMany).toHaveBeenCalledWith({
      where: { examId: 9, memberId: { in: [1, 2] } },
      data: { groupId: 40 },
    });
    expect(prisma.examGroup.deleteMany).toHaveBeenCalledWith({
      where: { examId: 9, members: { none: {} } },
    });
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

  it("lets any of the department's exam takers, heads, the ፅህፈት ቤት or office admins change an exam", async () => {
    // Created by user 2; user 3 is another exam taker of the Mezmur department.
    const otherTaker = actor(3, [4]);
    const head = actor(4, [4], { permissions: ['exams.override'] });
    const secretariat = actor(5, [1, 4], { inOffice: true });
    prisma.exam.findFirst.mockResolvedValue(examRow());

    for (const who of [mezmurAdmin, otherTaker, head, office, secretariat]) {
      await service.update(9, { heldOn: '2026-11-20' }, who);
      await expect(service.findOne(9, who)).resolves.toMatchObject({ canManage: true });
    }
    expect(prisma.exam.update).toHaveBeenCalledTimes(5);

    // Another department's exam taker doesn't even find it.
    prisma.exam.findFirst.mockResolvedValue(null);
    await expect(service.update(9, { passMark: 50 }, actor(6, [2]))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('closes an exam to exam takers 5 days after its date, but not to heads or the ፅህፈት ቤት', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-24T09:00:00Z'), doNotFake: ['nextTick'] });
    try {
      const head = actor(4, [4], { permissions: ['exams.override'] });
      const secretariat = actor(5, [1, 4], { inOffice: true });
      // Held on 19 Nov: open through the 24th, closed from the 25th.
      prisma.exam.findFirst.mockResolvedValue(examRow({ heldOn: new Date('2026-11-19') }));
      await expect(service.findOne(9, mezmurAdmin)).resolves.toMatchObject({
        canManage: true,
        editableUntil: '2026-11-24',
      });

      jest.setSystemTime(new Date('2026-11-25T09:00:00Z'));
      await expect(service.findOne(9, mezmurAdmin)).resolves.toMatchObject({ canManage: false });
      for (const taker of [mezmurAdmin, actor(3, [4])]) {
        await expect(service.update(9, { passMark: 50 }, taker)).rejects.toMatchObject({
          message: expect.stringContaining('closed for changes'),
        });
      }
      for (const who of [head, secretariat, office]) {
        await expect(service.update(9, { passMark: 50 }, who)).resolves.toBeDefined();
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
