import { Injectable } from '@nestjs/common';
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
