import { memberScopeWhere, type DepartmentScope } from '../../common/auth/department-scope.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { Paginated } from '../../common/pagination/paginated.js';
import { detectImageType, MIME_BY_EXT } from '../../common/utils/image-type.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  closeClassPeriods,
  closeServicePeriods,
  openClassPeriods,
} from '../history/history.writer.js';
import { FileStorageService } from '../storage/file-storage.service.js';
import { dateOnly, today, todayIso } from '../../common/utils/dates.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { QueryMembersDto } from './dto/query-members.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { formatMemberCode } from './member-code.js';

const ENTITY = 'Member';

const MEMBER_SELECT = {
  id: true,
  memberCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  christianName: true,
  gender: true,
  dateOfBirth: true,
  placeOfBirth: true,
  maritalStatus: true,
  phone: true,
  alternatePhone: true,
  email: true,
  city: true,
  subCity: true,
  woreda: true,
  kebele: true,
  houseNumber: true,
  educationLevel: true,
  occupation: true,
  spiritualFatherName: true,
  status: true,
  joinedAt: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelation: true,
  photoPath: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  classEnrollments: {
    select: {
      assignedAt: true,
      classType: { select: { id: true, code: true, nameEn: true, nameAm: true, sortOrder: true } },
      classGrade: {
        select: {
          id: true,
          code: true,
          nameEn: true,
          nameAm: true,
          shortLabel: true,
          isActive: true,
        },
      },
    },
  },
  departmentRoles: {
    select: {
      id: true,
      role: true,
      joinedAt: true,
      department: { select: { id: true, code: true, nameEn: true, nameAm: true, isActive: true } },
    },
    orderBy: { department: { sortOrder: 'asc' } },
  },
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SELECT }>;

/** API shape: the storage path stays internal; clients only learn whether a photo exists. */
type MemberClass = Omit<MemberRow['classEnrollments'][number], 'classType'> & {
  classType: Omit<MemberRow['classEnrollments'][number]['classType'], 'sortOrder'>;
};

/** API shape: the storage path stays internal; clients only learn whether a photo exists. */
export type MemberRecord = Omit<MemberRow, 'photoPath' | 'classEnrollments' | 'departmentRoles'> & {
  /** Departments the member serves in, with their role. */
  departments: MemberRow['departmentRoles'];
  hasPhoto: boolean;
  /** Current grade per class type, in class-type order. */
  classes: MemberClass[];
};

const toMember = ({
  photoPath,
  classEnrollments,
  departmentRoles,
  ...rest
}: MemberRow): MemberRecord => ({
  ...rest,
  departments: departmentRoles,
  hasPhoto: photoPath !== null,
  classes: [...classEnrollments]
    .sort(
      (a, b) => a.classType.sortOrder - b.classType.sortOrder || a.classType.id - b.classType.id,
    )
    .map(({ classType: { sortOrder: _sortOrder, ...classType }, ...e }) => ({ ...e, classType })),
});

/** Largest accepted photo. The web app downsizes before uploading, so this is generous. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Fields that are NOT NULL in the database; PATCH may omit them but never null them. */
const NON_NULLABLE_FIELDS = ['firstName', 'fatherName', 'gender', 'status', 'joinedAt'] as const;

const SEARCHABLE_FIELDS = [
  'firstName',
  'fatherName',
  'grandfatherName',
  'christianName',
  'memberCode',
  'phone',
] as const satisfies readonly (keyof Prisma.MemberWhereInput)[];

/** 'YYYY-MM-DD' → Date at UTC midnight (stored in a DATE column). */
const toDate = dateOnly;
const toOptionalDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined || value === null ? value : toDate(value);

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: FileStorageService,
  ) {}

  async findAll(
    query: QueryMembersDto,
    scope: DepartmentScope = null,
  ): Promise<Paginated<MemberRecord>> {
    const where: Prisma.MemberWhereInput = {
      AND: [this.buildWhere(query), memberScopeWhere(scope)],
    };
    const orderBy: Prisma.MemberOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortOrder },
      { id: query.sortOrder },
    ];

    const [total, items] = await this.prisma.$transaction([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.pageSize,
        select: MEMBER_SELECT,
      }),
    ]);
    return Paginated.of(items.map(toMember), total, query.page, query.pageSize);
  }

  async findOne(id: number, scope: DepartmentScope = null): Promise<MemberRecord> {
    return toMember(await this.findRow(id, scope));
  }

  /** Department-scoped users get 404 for members outside their departments and classes. */
  private async findRow(id: number, scope: DepartmentScope = null): Promise<MemberRow> {
    const member = await this.prisma.member.findFirst({
      where: { id, deletedAt: null, ...memberScopeWhere(scope) },
      select: MEMBER_SELECT,
    });
    if (!member) {
      throw new NotFoundException(`Member ${id} not found`);
    }
    return member;
  }

  /**
   * Registers a member. Pass `outerTx` to run inside a caller's transaction
   * (the Excel import uses this so a whole file is all-or-nothing).
   */
  async create(
    dto: CreateMemberDto,
    userId: number,
    ipAddress: string | null,
    outerTx?: Prisma.TransactionClient,
  ): Promise<MemberRecord> {
    if (!dto.dateOfBirth) {
      throw new ValidationFailedException([
        { field: 'dateOfBirth', messages: ['dateOfBirth is required'] },
      ]);
    }

    const { classGradeIds, ...fields } = dto;
    await this.assertUniqueName(dto, null, outerTx);
    const placements = classGradeIds ? await this.resolveClassGrades(classGradeIds) : [];

    const run = async (tx: Prisma.TransactionClient) => {
      // The code is derived from the auto-increment id, so insert with a
      // unique placeholder, then stamp the real code in the same transaction.
      const created = await tx.member.create({
        data: {
          ...fields,
          memberCode: `TMP-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          dateOfBirth: toOptionalDate(dto.dateOfBirth),
          joinedAt: toDate(dto.joinedAt ?? todayIso()),
          createdById: userId,
          updatedById: userId,
        },
        select: { id: true },
      });

      if (placements.length > 0) {
        await tx.memberClassEnrollment.createMany({
          data: placements.map((p) => ({ ...p, memberId: created.id, assignedById: userId })),
        });
        await openClassPeriods(
          tx,
          placements.map((p) => ({ ...p, memberId: created.id })),
          today(),
          userId,
        );
      }

      const member = await tx.member.update({
        where: { id: created.id },
        data: { memberCode: formatMemberCode(created.id) },
        select: MEMBER_SELECT,
      });

      await this.audit.record(
        {
          userId,
          action: 'CREATE',
          entity: ENTITY,
          entityId: member.id,
          changes: { memberCode: member.memberCode },
          ipAddress,
        },
        tx,
      );
      return toMember(member);
    };
    return outerTx ? run(outerTx) : this.prisma.$transaction(run);
  }

  async update(
    id: number,
    dto: UpdateMemberDto,
    userId: number,
    ipAddress: string | null,
  ): Promise<MemberRecord> {
    const nulled = NON_NULLABLE_FIELDS.filter((field) => dto[field] === null);
    if (nulled.length > 0) {
      throw new ValidationFailedException(
        nulled.map((field) => ({
          field,
          messages: [`${field} cannot be empty`],
        })),
      );
    }

    const current = await this.findRow(id);
    if (dto.firstName || dto.fatherName || dto.grandfatherName !== undefined) {
      await this.assertUniqueName(
        {
          firstName: dto.firstName ?? current.firstName,
          fatherName: dto.fatherName ?? current.fatherName,
          grandfatherName:
            dto.grandfatherName !== undefined ? dto.grandfatherName : current.grandfatherName,
        },
        id,
      );
    }

    const { dateOfBirth, joinedAt, classGradeIds, ...rest } = dto;
    const placements =
      classGradeIds === undefined || classGradeIds === null
        ? null
        : await this.resolveClassGrades(
            classGradeIds,
            current.classEnrollments.map((e) => e.classGrade.id),
          );
    const data: Prisma.MemberUncheckedUpdateInput = {
      ...rest,
      ...(dateOfBirth !== undefined && {
        dateOfBirth: toOptionalDate(dateOfBirth),
      }),
      ...(joinedAt && { joinedAt: toDate(joinedAt) }),
      updatedById: userId,
    };

    return this.prisma.$transaction(async (tx) => {
      if (placements) await this.syncClasses(tx, id, current, placements, userId);
      const member = await tx.member.update({
        where: { id },
        data,
        select: MEMBER_SELECT,
      });
      await this.audit.record(
        {
          userId,
          action: 'UPDATE',
          entity: ENTITY,
          entityId: id,
          changes: { fields: Object.keys(dto) },
          ipAddress,
        },
        tx,
      );
      return toMember(member);
    });
  }

  /** Soft delete: the row stays for history and audit, but disappears from the API. */
  async remove(id: number, userId: number, ipAddress: string | null): Promise<void> {
    await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: userId },
      });
      // A removed member no longer sits in any class or department: end those periods.
      await closeClassPeriods(tx, id, today());
      await closeServicePeriods(tx, id, today());
      await this.audit.record(
        { userId, action: 'DELETE', entity: ENTITY, entityId: id, ipAddress },
        tx,
      );
    });
  }

  /** Replaces the member's photo. The old file is deleted only after the DB points at the new one. */
  async setPhoto(
    id: number,
    file: { buffer: Buffer; size: number } | undefined,
    userId: number,
    ipAddress: string | null,
  ): Promise<MemberRecord> {
    if (!file || file.size === 0) {
      throw new ValidationFailedException([
        { field: 'photo', messages: ['A photo file is required'] },
      ]);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new ValidationFailedException([
        { field: 'photo', messages: ['Photo must be 2 MB or smaller'] },
      ]);
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new ValidationFailedException([
        { field: 'photo', messages: ['Photo must be a JPEG, PNG or WebP image'] },
      ]);
    }

    const previous = (await this.findRow(id)).photoPath;
    const key = `members/${id}-${randomUUID().slice(0, 8)}.${type.ext}`;
    await this.storage.save(key, file.buffer);

    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const row = await tx.member.update({
          where: { id },
          data: { photoPath: key, updatedById: userId },
          select: MEMBER_SELECT,
        });
        await this.audit.record(
          {
            userId,
            action: 'UPDATE',
            entity: ENTITY,
            entityId: id,
            changes: { fields: ['photo'] },
            ipAddress,
          },
          tx,
        );
        return row;
      });
      if (previous) await this.storage.remove(previous);
      return toMember(member);
    } catch (err) {
      await this.storage.remove(key);
      throw err;
    }
  }

  async removePhoto(id: number, userId: number, ipAddress: string | null): Promise<MemberRecord> {
    const previous = (await this.findRow(id)).photoPath;
    const member = await this.prisma.$transaction(async (tx) => {
      const row = await tx.member.update({
        where: { id },
        data: { photoPath: null, updatedById: userId },
        select: MEMBER_SELECT,
      });
      await this.audit.record(
        {
          userId,
          action: 'UPDATE',
          entity: ENTITY,
          entityId: id,
          changes: { fields: ['photo'] },
          ipAddress,
        },
        tx,
      );
      return row;
    });
    if (previous) await this.storage.remove(previous);
    return toMember(member);
  }

  /**
   * A member's full name (first + father's + grandfather's) is unique among
   * current members. The database collation makes the match case-insensitive.
   */
  private async assertUniqueName(
    names: { firstName: string; fatherName: string; grandfatherName?: string | null },
    exceptId: number | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const twin = await tx.member.findFirst({
      where: {
        deletedAt: null,
        firstName: names.firstName.trim(),
        fatherName: names.fatherName.trim(),
        grandfatherName: names.grandfatherName?.trim() || null,
        ...(exceptId !== null && { id: { not: exceptId } }),
      },
      select: { memberCode: true },
    });
    if (twin) {
      // Key + params: the web app shows it translated (see translateMessage).
      throw new ValidationFailedException([
        {
          field: 'firstName',
          messages: [`validation.duplicateName|${JSON.stringify({ code: twin.memberCode })}`],
        },
      ]);
    }
  }

  async openPhoto(id: number, scope: DepartmentScope = null) {
    const { photoPath } = await this.findRow(id, scope);
    if (!photoPath) throw new NotFoundException('This member has no photo');
    const ext = photoPath.slice(photoPath.lastIndexOf('.') + 1);
    return {
      ...(await this.storage.open(photoPath)),
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    };
  }

  /**
   * Validates requested grade ids: each must exist, at most one per class
   * type, and be active — unless the member already has it (so deactivating
   * a grade never blocks editing its current members).
   */
  private async resolveClassGrades(
    gradeIds: number[],
    alreadyAssigned: number[] = [],
  ): Promise<{ classTypeId: number; classGradeId: number }[]> {
    const unique = [...new Set(gradeIds)];
    const grades = await this.prisma.classGrade.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        classTypeId: true,
        isActive: true,
        classType: { select: { isActive: true } },
      },
    });
    const messages: string[] = [];
    const missing = unique.filter((id) => !grades.some((g) => g.id === id));
    if (missing.length > 0) messages.push(`Unknown class grade(s): ${missing.join(', ')}`);
    const inactive = grades.filter(
      (g) => (!g.isActive || !g.classType.isActive) && !alreadyAssigned.includes(g.id),
    );
    if (inactive.length > 0) {
      messages.push(`Class grade(s) no longer offered: ${inactive.map((g) => g.id).join(', ')}`);
    }
    const types = grades.map((g) => g.classTypeId);
    if (new Set(types).size !== types.length) {
      messages.push('A member can be in only one grade per class type');
    }
    if (messages.length > 0)
      throw new ValidationFailedException([{ field: 'classGradeIds', messages }]);
    return grades.map((g) => ({ classTypeId: g.classTypeId, classGradeId: g.id }));
  }

  /** Replaces a member's class placements, keeping unchanged ones (and their assignedAt). */
  private async syncClasses(
    tx: Prisma.TransactionClient,
    memberId: number,
    current: MemberRow,
    next: { classTypeId: number; classGradeId: number }[],
    userId: number,
  ): Promise<void> {
    const before = current.classEnrollments.map((e) => ({
      classTypeId: e.classType.id,
      classGradeId: e.classGrade.id,
    }));
    const same = (a: { classTypeId: number; classGradeId: number }) => (b: typeof a) =>
      a.classTypeId === b.classTypeId && a.classGradeId === b.classGradeId;
    const removed = before.filter((b) => !next.some(same(b)));
    const added = next.filter((n) => !before.some(same(n)));
    const changedOn = today();
    if (removed.length > 0) {
      const types = removed.map((r) => r.classTypeId);
      await tx.memberClassEnrollment.deleteMany({
        where: { memberId, classTypeId: { in: types } },
      });
      await closeClassPeriods(tx, memberId, changedOn, types);
    }
    if (added.length > 0) {
      await tx.memberClassEnrollment.createMany({
        data: added.map((a) => ({ ...a, memberId, assignedById: userId })),
      });
      await openClassPeriods(
        tx,
        added.map((a) => ({ ...a, memberId })),
        changedOn,
        userId,
      );
    }
  }

  /** Every class and department period the member has had, newest first. */
  async history(id: number, scope: DepartmentScope = null) {
    await this.findRow(id, scope);
    const newestFirst = [{ startedAt: 'desc' as const }, { id: 'desc' as const }];
    const [classes, departments] = await Promise.all([
      this.prisma.classPlacementHistory.findMany({
        where: { memberId: id },
        orderBy: newestFirst,
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          classType: { select: { id: true, code: true, nameEn: true, nameAm: true } },
          classGrade: {
            select: { id: true, code: true, nameEn: true, nameAm: true, shortLabel: true },
          },
        },
      }),
      this.prisma.departmentServiceHistory.findMany({
        where: { memberId: id },
        orderBy: newestFirst,
        select: {
          id: true,
          role: true,
          startedAt: true,
          endedAt: true,
          department: { select: { id: true, code: true, nameEn: true, nameAm: true } },
        },
      }),
    ]);
    return { classes, departments };
  }

  /**
   * Dashboard numbers. `joinedByDay` covers the last ~13 months so the client
   * can bucket it into Ethiopian-calendar months (the server stays Gregorian).
   */
  async stats(scope: DepartmentScope = null) {
    const where: Prisma.MemberWhereInput = { deletedAt: null, ...memberScopeWhere(scope) };
    // For a department, "serving" and "placed" mean in its own departments and classes.
    const inDepartments = scope === null ? {} : { departmentId: { in: scope } };
    const inClasses = scope === null ? {} : { classType: { departmentId: { in: scope } } };
    const since = dateOnly(todayIso(new Date(Date.now() - 400 * 86_400_000)));
    const [total, byStatus, byGender, serving, placed, joined] = await Promise.all([
      this.prisma.member.count({ where }),
      this.prisma.member.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.member.groupBy({ by: ['gender'], where, _count: { _all: true } }),
      this.prisma.member.count({ where: { ...where, departmentRoles: { some: inDepartments } } }),
      this.prisma.member.count({ where: { ...where, classEnrollments: { some: inClasses } } }),
      this.prisma.member.groupBy({
        by: ['joinedAt'],
        where: { ...where, joinedAt: { gte: since } },
        _count: { _all: true },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);
    return {
      total,
      byStatus: byStatus.map((r) => ({ key: r.status, count: r._count._all })),
      byGender: byGender.map((r) => ({ key: r.gender, count: r._count._all })),
      /** Members serving in at least one department. */
      servingInDepartments: serving,
      /** Members placed in at least one class. */
      placedInClasses: placed,
      joinedByDay: joined.map((r) => ({
        date: r.joinedAt.toISOString().slice(0, 10),
        count: r._count._all,
      })),
    };
  }

  /**
   * Each search word must match at least one searchable field, so
   * "Abebe Kebede" finds first name Abebe + father's name Kebede.
   * MySQL's default *_ci collation makes `contains` case-insensitive.
   */
  buildWhere(query: QueryMembersDto): Prisma.MemberWhereInput {
    const terms = (query.search ?? '').split(' ').filter(Boolean).slice(0, 5);
    return {
      deletedAt: null,
      ...(query.gender && { gender: query.gender }),
      ...(query.status && { status: query.status }),
      ...(query.classGradeId && {
        classEnrollments: { some: { classGradeId: query.classGradeId } },
      }),
      ...(query.departmentId && {
        departmentRoles: { some: { departmentId: query.departmentId } },
      }),
      ...(terms.length > 0 && {
        AND: terms.map((term) => ({
          OR: SEARCHABLE_FIELDS.map((field) => ({
            [field]: { contains: term },
          })),
        })),
      }),
    };
  }
}
