import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { assertInScope, type DepartmentScope } from '../../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../../common/filters/all-exceptions.filter.js';
import { dateOnly, todayIso } from '../../../common/utils/dates.js';
import { detectImageType } from '../../../common/utils/image-type.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PermissionDecision, PermissionType } from '../../../generated/prisma/enums.js';
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
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Permission types that excuse the member from a session instead of marking them Absent. */
export const EXCUSING_TYPES: readonly PermissionType[] = [
  PermissionType.SICK_LEAVE,
  PermissionType.MISS_STUDY,
  PermissionType.CONSECUTIVE_DAYS,
  PermissionType.OTHER,
];

const MEMBER_SELECT = {
  id: true,
  memberCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  christianName: true,
  phone: true,
  photoPath: true,
  updatedAt: true,
} satisfies Prisma.MemberSelect;

const PERMISSION_SELECT = {
  id: true,
  code: true,
  memberId: true,
  departmentId: true,
  type: true,
  typeOther: true,
  graceMinutes: true,
  weekdays: true,
  startsOn: true,
  endsOn: true,
  fromTime: true,
  toTime: true,
  reason: true,
  requestedOn: true,
  contactPhone: true,
  memberConfirmed: true,
  memberConfirmedOn: true,
  decision: true,
  decidedOn: true,
  representativeName: true,
  headName: true,
  evidenceName: true,
  evidenceType: true,
  revokedAt: true,
  createdAt: true,
  member: { select: MEMBER_SELECT },
  department: { select: { id: true, nameAm: true, nameEn: true } },
} satisfies Prisma.LatePermissionSelect;
type PermissionRow = Prisma.LatePermissionGetPayload<{ select: typeof PERMISSION_SELECT }>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const isoOrNull = (d: Date | null) => (d ? iso(d) : null);

export type PermissionState = 'pending' | 'rejected' | 'upcoming' | 'active' | 'ended';

/**
 * Where a permission stands today: awaiting a decision, refused, or — once
 * approved — before its start, running, or over (expired or ended early).
 */
export function permissionState(
  p: { startsOn: Date; endsOn: Date; revokedAt: Date | null; decision: PermissionDecision },
  today = todayIso(),
): PermissionState {
  if (p.decision === PermissionDecision.REJECTED) return 'rejected';
  if (p.revokedAt || iso(p.endsOn) < today) return 'ended';
  if (p.decision !== PermissionDecision.APPROVED) return 'pending';
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
    requestedOn: iso(p.requestedOn),
    memberConfirmedOn: isoOrNull(p.memberConfirmedOn),
    decidedOn: isoOrNull(p.decidedOn),
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

/** What a member's approved permissions mean for one session. */
export interface SessionCover {
  /** Late-arrival grace (0 = none). */
  graceMinutes: number;
  /** An absence permission: closing marks them Excused instead of Absent. */
  excuse: { code: string; type: PermissionType } | null;
  /** May leave early (recorded only). */
  leaveEarly: { code: string; fromTime: string | null } | null;
}

/**
 * Permissions (ፈቃድ) from the paper request form: a department lets a member
 * arrive late, be away, or leave early from the class and service-group
 * sessions it runs. Only approved ones change attendance, and one
 * department's permission never covers another department's sessions.
 */
@Injectable()
export class LatePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: FileStorageService,
  ) {}

  /**
   * What approved permissions mean for a session the department runs on
   * `date` ('YYYY-MM-DD', Addis) from `start` to `end` ('HH:mm'), per member.
   * `member` narrows to who may hold one (the session's roster). A
   * permission with a time window covers only sessions that overlap it.
   */
  async coverOn(
    departmentId: number,
    session: { date: string; start: string; end: string },
    member: Prisma.MemberWhereInput,
    memberIds?: number[],
  ): Promise<Map<number, SessionCover>> {
    const day = dateOnly(session.date);
    const rows = await this.prisma.latePermission.findMany({
      where: {
        departmentId,
        decision: PermissionDecision.APPROVED,
        revokedAt: null,
        startsOn: { lte: day },
        endsOn: { gte: day },
        member,
        ...(memberIds && { memberId: { in: memberIds } }),
      },
      select: {
        memberId: true,
        code: true,
        type: true,
        graceMinutes: true,
        weekdays: true,
        fromTime: true,
        toTime: true,
      },
      orderBy: { id: 'asc' },
    });
    const weekday = weekdayOf(session.date);
    const covers = new Map<number, SessionCover>();
    for (const r of rows) {
      if (!(r.weekdays as number[]).includes(weekday)) continue;
      const window = r.fromTime && r.toTime;
      if (window && !(r.fromTime! < session.end && r.toTime! > session.start)) continue;
      const cover = covers.get(r.memberId) ?? { graceMinutes: 0, excuse: null, leaveEarly: null };
      if (r.type === PermissionType.LATE_ARRIVAL) {
        cover.graceMinutes = Math.max(cover.graceMinutes, r.graceMinutes ?? 0);
      } else if (r.type === PermissionType.LEAVE_EARLY) {
        cover.leaveEarly ??= { code: r.code, fromTime: r.fromTime };
      } else {
        cover.excuse ??= { code: r.code, type: r.type };
      }
      covers.set(r.memberId, cover);
    }
    return covers;
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
      select: MEMBER_SELECT,
      orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
      take: 20,
    });
    return rows.map(({ photoPath, ...m }) => ({ ...m, hasPhoto: photoPath !== null }));
  }

  async list(q: QueryLatePermissionsDto, scope: DepartmentScope) {
    const today = dateOnly(todayIso());
    const approved = { decision: PermissionDecision.APPROVED, revokedAt: null };
    const state: Prisma.LatePermissionWhereInput =
      q.state === 'active'
        ? { ...approved, startsOn: { lte: today }, endsOn: { gte: today } }
        : q.state === 'upcoming'
          ? { ...approved, startsOn: { gt: today } }
          : q.state === 'pending'
            ? {
                decision: { in: [PermissionDecision.PENDING, PermissionDecision.NEEDS_INFO] },
                revokedAt: null,
                endsOn: { gte: today },
              }
            : q.state === 'rejected'
              ? { decision: PermissionDecision.REJECTED }
              : q.state === 'ended'
                ? {
                    decision: { not: PermissionDecision.REJECTED },
                    OR: [{ revokedAt: { not: null } }, { endsOn: { lt: today } }],
                  }
                : {};
    const terms = (q.search ?? '').split(' ').filter(Boolean).slice(0, 4);
    const rows = await this.prisma.latePermission.findMany({
      where: {
        ...(scope !== null && { departmentId: { in: scope } }),
        ...(q.departmentId && { departmentId: q.departmentId }),
        ...(q.memberId && { memberId: q.memberId }),
        ...(q.type && { type: q.type }),
        AND: [
          state,
          ...terms.map((term) => ({
            OR: [
              { code: { contains: term } },
              {
                member: {
                  OR: [
                    { firstName: { contains: term } },
                    { fatherName: { contains: term } },
                    { grandfatherName: { contains: term } },
                    { memberCode: { contains: term } },
                  ],
                },
              },
            ],
          })),
        ],
      },
      select: PERMISSION_SELECT,
      orderBy: [{ requestedOn: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map(toView);
  }

  async create(dto: CreateLatePermissionDto, userId: number, scope: DepartmentScope) {
    await this.validate(dto, scope);
    const row = await this.prisma.$transaction(async (tx) => {
      // The form number comes from the id: insert with a unique placeholder, then stamp it.
      const created = await tx.latePermission.create({
        data: {
          ...this.toData(dto),
          memberId: dto.memberId,
          departmentId: dto.departmentId,
          code: `TMP-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          createdById: userId,
        },
        select: { id: true },
      });
      return tx.latePermission.update({
        where: { id: created.id },
        data: { code: `PRM-${String(created.id).padStart(5, '0')}` },
        select: PERMISSION_SELECT,
      });
    });
    await this.audit.record({ userId, action: 'CREATE', entity: ENTITY, entityId: row.id });
    return toView(row);
  }

  async update(id: number, dto: UpdateLatePermissionDto, userId: number, scope: DepartmentScope) {
    const current = await this.findRow(id, scope);
    const has = (k: keyof UpdateLatePermissionDto) => dto[k] !== undefined;
    const merged: CreateLatePermissionDto = {
      memberId: dto.memberId ?? current.memberId,
      departmentId: dto.departmentId ?? current.departmentId,
      type: dto.type ?? current.type,
      typeOther: has('typeOther') ? dto.typeOther : current.typeOther,
      graceMinutes: has('graceMinutes') ? dto.graceMinutes : current.graceMinutes,
      weekdays: dto.weekdays ?? (current.weekdays as number[]),
      startsOn: dto.startsOn ?? iso(current.startsOn),
      endsOn: dto.endsOn ?? iso(current.endsOn),
      fromTime: has('fromTime') ? dto.fromTime : current.fromTime,
      toTime: has('toTime') ? dto.toTime : current.toTime,
      reason: dto.reason ?? current.reason,
      requestedOn: dto.requestedOn ?? iso(current.requestedOn),
      contactPhone: has('contactPhone') ? dto.contactPhone : current.contactPhone,
      memberConfirmed: dto.memberConfirmed ?? current.memberConfirmed,
      memberConfirmedOn: has('memberConfirmedOn')
        ? dto.memberConfirmedOn
        : isoOrNull(current.memberConfirmedOn),
      decision: dto.decision ?? current.decision,
      decidedOn: has('decidedOn') ? dto.decidedOn : isoOrNull(current.decidedOn),
      representativeName: has('representativeName')
        ? dto.representativeName
        : current.representativeName,
      headName: has('headName') ? dto.headName : current.headName,
    };
    await this.validate(merged, scope);
    const row = await this.prisma.latePermission.update({
      where: { id },
      data: {
        ...this.toData(merged),
        memberId: merged.memberId,
        departmentId: merged.departmentId,
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

  /** The columns for a validated form; fields that don't fit the type are cleared. */
  private toData(dto: CreateLatePermissionDto) {
    const late = dto.type === PermissionType.LATE_ARRIVAL;
    return {
      type: dto.type,
      typeOther: dto.type === PermissionType.OTHER ? (dto.typeOther ?? null) : null,
      graceMinutes: late ? (dto.graceMinutes ?? null) : null,
      weekdays: late ? [...new Set(dto.weekdays ?? [])].sort((a, b) => a - b) : EVERY_DAY,
      startsOn: dateOnly(dto.startsOn),
      endsOn: dateOnly(dto.endsOn),
      fromTime: dto.fromTime ?? null,
      toTime: dto.toTime ?? null,
      reason: dto.reason,
      requestedOn: dateOnly(dto.requestedOn),
      contactPhone: dto.contactPhone ?? null,
      memberConfirmed: dto.memberConfirmed ?? false,
      memberConfirmedOn:
        dto.memberConfirmed && dto.memberConfirmedOn ? dateOnly(dto.memberConfirmedOn) : null,
      decision: dto.decision,
      decidedOn: dto.decidedOn ? dateOnly(dto.decidedOn) : null,
      representativeName: dto.representativeName ?? null,
      headName: dto.headName ?? null,
    };
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
    if (dto.type === PermissionType.LATE_ARRIVAL) {
      if (!dto.graceMinutes) {
        errors.push({ field: 'graceMinutes', messages: ['attendance.permissions.graceRange'] });
      }
      if (!dto.weekdays?.length) {
        errors.push({ field: 'weekdays', messages: ['attendance.permissions.chooseDays'] });
      }
    }
    if (dto.type === PermissionType.OTHER && !dto.typeOther) {
      errors.push({ field: 'typeOther', messages: ['attendance.permissions.sayWhat'] });
    }
    if (Boolean(dto.fromTime) !== Boolean(dto.toTime)) {
      errors.push({ field: 'toTime', messages: ['attendance.permissions.bothTimes'] });
    } else if (dto.fromTime && dto.toTime && dto.toTime <= dto.fromTime) {
      errors.push({ field: 'toTime', messages: ['attendance.permissions.timeOrder'] });
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
