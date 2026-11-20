import { Injectable, NotFoundException } from '@nestjs/common';
import { memberScopeWhere } from '../../common/auth/department-scope.js';
import { Paginated } from '../../common/pagination/paginated.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { sessionScopeWhere } from '../attendance/attendance.service.js';
import { auditTargets } from './audit-targets.js';
import type { QueryAuditDto } from './dto/query-audit.dto.js';

/** Addis Ababa is UTC+3 all year: a day starts at 21:00 UTC the evening before. */
const addisDayStart = (date: string) => new Date(`${date}T00:00:00+03:00`);

const USER_REF = { select: { id: true, fullName: true, email: true } } as const;

type RefKind =
  | 'department'
  | 'classType'
  | 'classGrade'
  | 'serviceGroup'
  | 'serviceTerm'
  | 'assetCategory'
  | 'course'
  | 'member'
  | 'user';

/** Fields whose values are ids of other records, named on the detail page. */
const REF_FIELDS: Record<string, RefKind> = {
  departmentId: 'department',
  departmentIds: 'department',
  parentId: 'department',
  organiserId: 'department',
  classTypeId: 'classType',
  classGradeId: 'classGrade',
  classGradeIds: 'classGrade',
  serviceGroupId: 'serviceGroup',
  serviceGroupIds: 'serviceGroup',
  extraServiceGroupIds: 'serviceGroup',
  termId: 'serviceTerm',
  serviceTermId: 'serviceTerm',
  categoryId: 'assetCategory',
  courseId: 'course',
  memberId: 'member',
  memberIds: 'member',
  added: 'member',
  removed: 'member',
  userId: 'user',
  teacherIds: 'user',
};

/**
 * Reading the audit trail. Office administrators see everything. A
 * department head (or the ፅህፈት ቤት, whose departments are all of them) sees
 * what happened in their departments: everything they and the people working
 * only there did, and every change anyone made to their departments' members,
 * sessions, exams, classes, rosters, permissions, assets and courses. Other
 * departments' records stay hidden.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: QueryAuditDto, actor: AuthenticatedUser) {
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        await this.visibleWhere(actor),
        {
          ...(q.userId && { userId: q.userId }),
          ...(q.entity && { entity: q.entity }),
          ...(q.action && { action: q.action }),
          ...(q.search?.trim() && {
            OR: [
              { user: { fullName: { contains: q.search.trim() } } },
              { user: { email: { contains: q.search.trim() } } },
              { entity: { contains: q.search.trim() } },
              { entityId: { contains: q.search.trim() } },
              { ipAddress: { contains: q.search.trim() } },
            ],
          }),
          ...((q.from || q.to) && {
            createdAt: {
              ...(q.from && { gte: addisDayStart(q.from) }),
              ...(q.to && { lt: new Date(addisDayStart(q.to).getTime() + 86_400_000) }),
            },
          }),
        },
      ],
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: USER_REF },
        orderBy: [{ createdAt: q.sortOrder }, { id: q.sortOrder }],
        skip: q.skip,
        take: q.pageSize,
      }),
    ]);
    const targets = await auditTargets(this.prisma, rows);
    // BigInt ids don't serialise to JSON.
    const items = rows.map((r) => ({
      ...r,
      id: r.id.toString(),
      target: targets.get(`${r.entity}:${r.entityId}`) ?? null,
    }));
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  /**
   * One entry in full: who, when, from where, about what, and every recorded
   * value, with the ids in it (departments, classes, members…) named.
   */
  async detail(id: string, actor: AuthenticatedUser) {
    const row = /^\d{1,19}$/.test(id)
      ? await this.prisma.auditLog.findFirst({
          where: { AND: [await this.visibleWhere(actor), { id: BigInt(id) }] },
          include: { user: USER_REF },
        })
      : null;
    if (!row) throw new NotFoundException('Audit entry not found');
    const targets = await auditTargets(this.prisma, [row]);
    return {
      ...row,
      id: row.id.toString(),
      target: targets.get(`${row.entity}:${row.entityId}`) ?? null,
      refs: await this.refs(row.changes),
    };
  }

  /** Names for the ids found in an entry's values: field → id → { am, en }. */
  private async refs(changes: Prisma.JsonValue) {
    const found = new Map<RefKind, Set<number>>();
    const byField = new Map<string, number[]>();
    const take = (field: string, value: unknown) => {
      const kind = REF_FIELDS[field];
      if (!kind) return;
      const ids = (Array.isArray(value) ? value : [value]).filter(
        (v): v is number => typeof v === 'number' && Number.isInteger(v),
      );
      if (ids.length === 0) return;
      byField.set(field, [...(byField.get(field) ?? []), ...ids]);
      const set = found.get(kind) ?? new Set<number>();
      ids.forEach((i) => set.add(i));
      found.set(kind, set);
    };
    if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'diff' && value && typeof value === 'object' && !Array.isArray(value)) {
          for (const [field, change] of Object.entries(value)) {
            if (change && typeof change === 'object' && !Array.isArray(change)) {
              take(field, (change as Record<string, unknown>).from);
              take(field, (change as Record<string, unknown>).to);
            }
          }
        } else if ((key === 'before' || key === 'after') && value && typeof value === 'object') {
          for (const [field, v] of Object.entries(value)) take(field, v);
        } else {
          take(key, value);
        }
      }
    }
    const names = new Map<string, { am: string; en: string }>();
    const named = (kind: RefKind, rows: { id: number; nameAm: string; nameEn: string | null }[]) =>
      rows.forEach((r) => names.set(`${kind}:${r.id}`, { am: r.nameAm, en: r.nameEn || r.nameAm }));
    const ids = (kind: RefKind) => ({ id: { in: [...(found.get(kind) ?? [])] } });
    const NAME = { id: true, nameAm: true, nameEn: true } as const;
    await Promise.all(
      [...found.keys()].map(async (kind) => {
        switch (kind) {
          case 'department':
            return named(
              kind,
              await this.prisma.department.findMany({ where: ids(kind), select: NAME }),
            );
          case 'classType':
            return named(
              kind,
              await this.prisma.classType.findMany({ where: ids(kind), select: NAME }),
            );
          case 'classGrade':
            return named(
              kind,
              await this.prisma.classGrade.findMany({ where: ids(kind), select: NAME }),
            );
          case 'serviceGroup':
            return named(
              kind,
              await this.prisma.serviceGroup.findMany({ where: ids(kind), select: NAME }),
            );
          case 'serviceTerm':
            return named(
              kind,
              await this.prisma.serviceTerm.findMany({ where: ids(kind), select: NAME }),
            );
          case 'assetCategory':
            return named(
              kind,
              await this.prisma.assetCategory.findMany({ where: ids(kind), select: NAME }),
            );
          case 'course':
            return named(
              kind,
              await this.prisma.course.findMany({ where: ids(kind), select: NAME }),
            );
          case 'member':
            return (
              await this.prisma.member.findMany({
                where: ids(kind),
                select: { id: true, memberCode: true, firstName: true, fatherName: true },
              })
            ).forEach((m) => {
              const name = `${m.firstName} ${m.fatherName} (${m.memberCode})`;
              names.set(`member:${m.id}`, { am: name, en: name });
            });
          case 'user':
            return (
              await this.prisma.user.findMany({
                where: ids(kind),
                select: { id: true, fullName: true },
              })
            ).forEach((u) => names.set(`user:${u.id}`, { am: u.fullName, en: u.fullName }));
        }
      }),
    );
    const out: Record<string, Record<string, { am: string; en: string }>> = {};
    for (const [field, list] of byField) {
      const kind = REF_FIELDS[field]!;
      for (const i of list) {
        const name = names.get(`${kind}:${i}`);
        if (name) (out[field] ??= {})[i] = name;
      }
    }
    return out;
  }

  /** The people whose actions the actor may see (for the filter). */
  async users(actor: AuthenticatedUser) {
    const scope = actor.departmentIds;
    return this.prisma.user.findMany({
      where:
        scope === null
          ? {}
          : {
              OR: [
                staffWhere(actor.id, scope),
                { auditLogs: { some: await this.recordsWhere(scope) } },
              ],
            },
      select: USER_REF.select,
      orderBy: { fullName: 'asc' },
    });
  }

  private async visibleWhere(actor: AuthenticatedUser): Promise<Prisma.AuditLogWhereInput> {
    const scope = actor.departmentIds;
    if (scope === null) return {};
    return { OR: [{ user: staffWhere(actor.id, scope) }, await this.recordsWhere(scope)] };
  }

  /** Entries about records that belong to the departments in scope. */
  private async recordsWhere(scope: number[]): Promise<Prisma.AuditLogWhereInput> {
    const inScope = { in: scope };
    const ids = (rows: { id: number }[]) => rows.map((r) => String(r.id));
    const select = { id: true } as const;
    const [
      members,
      sessions,
      exams,
      types,
      grades,
      agreements,
      rosters,
      permits,
      assets,
      courses,
      runs,
    ] = await this.prisma.$transaction([
      this.prisma.member.findMany({ where: memberScopeWhere(scope), select }),
      this.prisma.attendanceSession.findMany({ where: sessionScopeWhere(scope), select }),
      this.prisma.exam.findMany({ where: { classType: { departmentId: inScope } }, select }),
      this.prisma.classType.findMany({ where: { departmentId: inScope }, select }),
      this.prisma.classGrade.findMany({ where: { classType: { departmentId: inScope } }, select }),
      this.prisma.classAgreement.findMany({
        where: { classType: { departmentId: inScope } },
        select,
      }),
      this.prisma.departmentMembership.findMany({ where: { departmentId: inScope }, select }),
      this.prisma.latePermission.findMany({ where: { departmentId: inScope }, select }),
      this.prisma.asset.findMany({ where: { departmentId: inScope }, select }),
      this.prisma.course.findMany({ where: { departmentId: inScope }, select }),
      this.prisma.courseOffering.findMany({ where: { course: { departmentId: inScope } }, select }),
    ]);
    const byEntity: [string[], string[]][] = [
      [['Member', 'MemberPortal'], ids(members)],
      [['AttendanceSession'], ids(sessions)],
      [['Exam'], ids(exams)],
      [['ClassType'], ids(types)],
      [['ClassGrade'], ids(grades)],
      [['ClassAgreement'], ids(agreements)],
      [['Department'], scope.map(String)],
      [['DepartmentMembership'], ids(rosters)],
      [['LatePermission'], ids(permits)],
      [['Asset'], ids(assets)],
      [['Course'], ids(courses)],
      [['CourseOffering'], ids(runs)],
    ];
    return {
      OR: byEntity
        .filter(([, list]) => list.length > 0)
        .map(([entity, list]) => ({ entity: { in: entity }, entityId: { in: list } })),
    };
  }
}

/** The actor and the users who work only in departments within their scope. */
function staffWhere(actorId: number, scope: number[]): Prisma.UserWhereInput {
  return {
    OR: [{ id: actorId }, { departments: { some: {}, every: { departmentId: { in: scope } } } }],
  };
}
