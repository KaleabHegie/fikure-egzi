import { Injectable } from '@nestjs/common';
import type { DepartmentScope } from '../../common/auth/department-scope.js';
import { Paginated } from '../../common/pagination/paginated.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { manageableUsersWhere } from '../users/users.service.js';
import type { QueryAuditDto } from './dto/query-audit.dto.js';

/** Addis Ababa is UTC+3 all year: a day starts at 21:00 UTC the evening before. */
const addisDayStart = (date: string) => new Date(`${date}T00:00:00+03:00`);

const USER_REF = { select: { id: true, fullName: true, email: true } } as const;

/**
 * Reading the audit trail. Office administrators see everything; a department
 * administrator sees their own actions and those of the users under them
 * (their departments' attendance takers).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: QueryAuditDto, actor: AuthenticatedUser) {
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        this.visibleWhere(actor),
        {
          ...(q.userId && { userId: q.userId }),
          ...(q.entity && { entity: q.entity }),
          ...(q.action && { action: q.action }),
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
    // BigInt ids don't serialise to JSON.
    const items = rows.map((r) => ({ ...r, id: r.id.toString() }));
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  /** The people whose actions the actor may see (for the filter). */
  async users(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: this.usersWhere(actor.id, actor.departmentIds),
      select: USER_REF.select,
      orderBy: { fullName: 'asc' },
    });
  }

  private usersWhere(actorId: number, scope: DepartmentScope): Prisma.UserWhereInput {
    return scope === null ? {} : { OR: [{ id: actorId }, manageableUsersWhere(scope)] };
  }

  private visibleWhere(actor: AuthenticatedUser): Prisma.AuditLogWhereInput {
    if (actor.departmentIds === null) return {};
    return { user: this.usersWhere(actor.id, actor.departmentIds) };
  }
}
