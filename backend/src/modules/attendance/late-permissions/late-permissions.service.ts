import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { assertInScope, type DepartmentScope } from '../../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../../common/filters/all-exceptions.filter.js';
import { dateOnly, todayIso } from '../../../common/utils/dates.js';
import { detectImageType } from '../../../common/utils/image-type.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { FileStorageService } from '../../storage/file-storage.service.js';
import { weekdayOf } from '../attendance-math.js';
import type {
  CreateLatePermissionDto,
  QueryLatePermissionsDto,
  UpdateLatePermissionDto,
} from './late-permission.dto.js';

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const ENTITY = 'LatePermission';

const PERMISSION_SELECT = {
  id: true,
  memberId: true,
  departmentId: true,
  graceMinutes: true,
  weekdays: true,
  startsOn: true,
  endsOn: true,
  reason: true,
  evidenceName: true,
  evidenceType: true,
  revokedAt: true,
  createdAt: true,
  member: {
    select: {
      id: true,
      memberCode: true,
      firstName: true,
      fatherName: true,
      grandfatherName: true,
      christianName: true,
      photoPath: true,
      updatedAt: true,
    },
  },
  department: { select: { id: true, nameAm: true, nameEn: true } },
} satisfies Prisma.LatePermissionSelect;
type PermissionRow = Prisma.LatePermissionGetPayload<{ select: typeof PERMISSION_SELECT }>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Where a permission stands today: before its start, running, or over (expired or ended early). */
export function permissionState(
  p: { startsOn: Date; endsOn: Date; revokedAt: Date | null },
  today = todayIso(),
): 'upcoming' | 'active' | 'ended' {
  if (p.revokedAt || iso(p.endsOn) < today) return 'ended';
  return iso(p.startsOn) > today ? 'upcoming' : 'active';
}

function toView(p: PermissionRow) {
  const {
    member: { photoPath, ...member },
    ...rest
  } = p;
  return {
    ...rest,
    weekdays: (p.weekdays as number[]).slice().sort((a, b) => a - b),
    startsOn: iso(p.startsOn),
    endsOn: iso(p.endsOn),
    hasEvidence: p.evidenceType !== null,
    state: permissionState(p),
    member: { ...member, hasPhoto: photoPath !== null },
  };
}

/** Members a department may give a permission to: in a class it runs, or in one of its service groups. */
export function departmentMembersWhere(departmentId: number): Prisma.MemberWhereInput {
  const runs = { classType: { departmentId } };
  return {
    deletedAt: null,
    OR: [
      { classEnrollments: { some: { classGrade: runs } } },
      { serviceGroups: { some: { group: { classGrade: runs } } } },
    ],
  };
}

/** The evidence file kinds accepted: a photo or a PDF, identified by their bytes. */
function evidenceType(buf: Buffer): { ext: string; mime: string } | null {
  const image = detectImageType(buf);
  if (image) return image;
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  return null;
}

/**
 * Late permissions: a department lets a member arrive up to N minutes late
 * to the class and service-group sessions it runs, on given weekdays, for a
 * period. A permission from one department never covers another's sessions.
 */
@Injectable()
export class LatePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: FileStorageService,
  ) {}

  /**
   * Grace minutes per member for a session the department runs on `date`
   * ('YYYY-MM-DD', Addis): the longest of their permissions that cover that
   * day. `member` narrows to who may hold one (the session's roster).
   */
  async graceOn(
    departmentId: number,
    date: string,
    member: Prisma.MemberWhereInput,
    memberIds?: number[],
  ): Promise<Map<number, number>> {
    const day = dateOnly(date);
    const rows = await this.prisma.latePermission.findMany({
      where: {
        departmentId,
        revokedAt: null,
        startsOn: { lte: day },
        endsOn: { gte: day },
        member,
        ...(memberIds && { memberId: { in: memberIds } }),
      },
      select: { memberId: true, graceMinutes: true, weekdays: true },
    });
    const weekday = weekdayOf(date);
    const grace = new Map<number, number>();
    for (const r of rows) {
      if (!(r.weekdays as number[]).includes(weekday)) continue;
      grace.set(r.memberId, Math.max(grace.get(r.memberId) ?? 0, r.graceMinutes));
    }
    return grace;
  }

  /** Departments the actor may issue permissions for: their own that run a class. */
  async departments(scope: DepartmentScope) {
    return this.prisma.department.findMany({
      where: {
        classTypes: { some: {} },
        ...(scope !== null && { id: { in: scope } }),
      },
      select: { id: true, nameAm: true, nameEn: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async candidates(departmentId: number, search: string | undefined, scope: DepartmentScope) {
    assertInScope(scope, departmentId, 'You can only give permissions for your own department.');
    const terms = (search ?? '').split(' ').filter(Boolean).slice(0, 4);
    const rows = await this.prisma.member.findMany({
      where: {
        AND: [
          departmentMembersWhere(departmentId),
          ...terms.map((term) => ({
            OR: [
              { firstName: { contains: term } },
              { fatherName: { contains: term } },
              { grandfatherName: { contains: term } },
              { christianName: { contains: term } },
              { memberCode: { contains: term } },
            ],
          })),
        ],
      },
      select: PERMISSION_SELECT.member.select,
      orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
      take: 20,
    });
    return rows.map(({ photoPath, ...m }) => ({ ...m, hasPhoto: photoPath !== null }));
  }

  async list(q: QueryLatePermissionsDto, scope: DepartmentScope) {
    const today = dateOnly(todayIso());
    const state: Prisma.LatePermissionWhereInput =
      q.state === 'active'
        ? { revokedAt: null, startsOn: { lte: today }, endsOn: { gte: today } }
        : q.state === 'upcoming'
          ? { revokedAt: null, startsOn: { gt: today } }
          : q.state === 'ended'
            ? { OR: [{ revokedAt: { not: null } }, { endsOn: { lt: today } }] }
            : {};
    const terms = (q.search ?? '').split(' ').filter(Boolean).slice(0, 4);
    const rows = await this.prisma.latePermission.findMany({
      where: {
        ...(scope !== null && { departmentId: { in: scope } }),
        ...(q.departmentId && { departmentId: q.departmentId }),
        ...(q.memberId && { memberId: q.memberId }),
        AND: [
          state,
          ...terms.map((term) => ({
            member: {
              OR: [
                { firstName: { contains: term } },
                { fatherName: { contains: term } },
                { grandfatherName: { contains: term } },
                { memberCode: { contains: term } },
              ],
            },
          })),
        ],
      },
      select: PERMISSION_SELECT,
      orderBy: [{ endsOn: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map(toView);
  }

  async create(dto: CreateLatePermissionDto, userId: number, scope: DepartmentScope) {
    await this.validate(dto, scope);
    const row = await this.prisma.latePermission.create({
      data: {
        memberId: dto.memberId,
        departmentId: dto.departmentId,
        graceMinutes: dto.graceMinutes,
        weekdays: [...new Set(dto.weekdays)].sort((a, b) => a - b),
        startsOn: dateOnly(dto.startsOn),
        endsOn: dateOnly(dto.endsOn),
        reason: dto.reason,
        createdById: userId,
      },
      select: PERMISSION_SELECT,
    });
    await this.audit.record({ userId, action: 'CREATE', entity: ENTITY, entityId: row.id });
    return toView(row);
  }

  async update(id: number, dto: UpdateLatePermissionDto, userId: number, scope: DepartmentScope) {
    const current = await this.findRow(id, scope);
    const merged: CreateLatePermissionDto = {
      memberId: dto.memberId ?? current.memberId,
      departmentId: dto.departmentId ?? current.departmentId,
      graceMinutes: dto.graceMinutes ?? current.graceMinutes,
      weekdays: dto.weekdays ?? (current.weekdays as number[]),
      startsOn: dto.startsOn ?? iso(current.startsOn),
      endsOn: dto.endsOn ?? iso(current.endsOn),
      reason: dto.reason ?? current.reason,
    };
    await this.validate(merged, scope);
    const row = await this.prisma.latePermission.update({
      where: { id },
      data: {
        memberId: merged.memberId,
        departmentId: merged.departmentId,
        graceMinutes: merged.graceMinutes,
        weekdays: [...new Set(merged.weekdays)].sort((a, b) => a - b),
        startsOn: dateOnly(merged.startsOn),
        endsOn: dateOnly(merged.endsOn),
        reason: merged.reason,
      },
      select: PERMISSION_SELECT,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return toView(row);
  }

  /** Ends a permission today; it stops applying straight away and stays in the record. */
  async end(id: number, userId: number, scope: DepartmentScope) {
    await this.findRow(id, scope);
    const row = await this.prisma.latePermission.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: PERMISSION_SELECT,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { ended: true },
    });
    return toView(row);
  }

  async remove(id: number, userId: number, scope: DepartmentScope): Promise<void> {
    const row = await this.findRow(id, scope);
    await this.prisma.latePermission.delete({ where: { id } });
    if (row.evidencePath) await this.storage.remove(row.evidencePath);
    await this.audit.record({ userId, action: 'DELETE', entity: ENTITY, entityId: id });
  }

  async setEvidence(
    id: number,
    file: { buffer: Buffer; size: number; originalname?: string } | undefined,
    userId: number,
    scope: DepartmentScope,
  ) {
    const current = await this.findRow(id, scope);
    if (!file || file.size === 0) {
      throw new ValidationFailedException([{ field: 'file', messages: ['A file is required'] }]);
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      throw new ValidationFailedException([
        { field: 'file', messages: ['attendance.permissions.evidenceTooLarge'] },
      ]);
    }
    const type = evidenceType(file.buffer);
    if (!type) {
      throw new ValidationFailedException([
        { field: 'file', messages: ['attendance.permissions.evidenceType'] },
      ]);
    }
    const key = `late-permissions/${id}-${randomUUID().slice(0, 8)}.${type.ext}`;
    await this.storage.save(key, file.buffer);
    const name = (file.originalname ?? `evidence.${type.ext}`).slice(0, 150);
    const row = await this.prisma.latePermission.update({
      where: { id },
      data: { evidencePath: key, evidenceName: name, evidenceType: type.mime },
      select: PERMISSION_SELECT,
    });
    // The old file goes only once the record points at the new one.
    if (current.evidencePath) await this.storage.remove(current.evidencePath);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: ['evidence'] },
    });
    return toView(row);
  }

  async removeEvidence(id: number, userId: number, scope: DepartmentScope) {
    const current = await this.findRow(id, scope);
    const row = await this.prisma.latePermission.update({
      where: { id },
      data: { evidencePath: null, evidenceName: null, evidenceType: null },
      select: PERMISSION_SELECT,
    });
    if (current.evidencePath) await this.storage.remove(current.evidencePath);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: ['evidence'], removed: true },
    });
    return toView(row);
  }

  async openEvidence(id: number, scope: DepartmentScope) {
    const row = await this.findRow(id, scope);
    if (!row.evidencePath || !row.evidenceType) throw new NotFoundException('No evidence file');
    const { stream, size } = await this.storage.open(row.evidencePath);
    return { stream, size, mime: row.evidenceType, name: row.evidenceName ?? 'evidence' };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findRow(id: number, scope: DepartmentScope) {
    const row = await this.prisma.latePermission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Late permission ${id} not found`);
    assertInScope(scope, row.departmentId, 'This permission belongs to another department.');
    return row;
  }

  private async validate(dto: CreateLatePermissionDto, scope: DepartmentScope) {
    assertInScope(
      scope,
      dto.departmentId,
      'You can only give permissions for your own department.',
    );
    const errors: { field: string; messages: string[] }[] = [];
    if (dto.endsOn < dto.startsOn) {
      errors.push({ field: 'endsOn', messages: ['attendance.permissions.endBeforeStart'] });
    }
    const runsClasses = await this.prisma.classType.count({
      where: { departmentId: dto.departmentId },
    });
    if (runsClasses === 0) {
      errors.push({ field: 'departmentId', messages: ['attendance.permissions.noClasses'] });
    } else {
      const belongs = await this.prisma.member.count({
        where: { id: dto.memberId, ...departmentMembersWhere(dto.departmentId) },
      });
      if (belongs === 0) {
        errors.push({ field: 'memberId', messages: ['attendance.permissions.notInDepartment'] });
      }
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
  }
}
