import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  assertInScope,
  type DepartmentScope,
  memberScopeWhere,
} from '../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { Paginated } from '../../common/pagination/paginated.js';
import { dateOnly, todayIso } from '../../common/utils/dates.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  AttendanceMethod,
  AttendanceSessionKind,
  AttendanceSessionStatus,
  AttendanceStatus,
  MembershipStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  addCount,
  addisDateTime,
  attendanceRate,
  emptyCounts,
  minutesAttended,
  normalizeMemberCode,
  type StatusCounts,
  statusForCheckIn,
} from './attendance-math.js';
import type {
  CreateSessionDto,
  MarkDto,
  QuerySessionsDto,
  ReportQueryDto,
  TopAttendanceQueryDto,
  UpdateSessionDto,
} from './dto/attendance.dto.js';

const MEMBER_SUMMARY = {
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
type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SUMMARY }>;
const toSummary = ({ photoPath, ...m }: MemberRow) => ({ ...m, hasPhoto: photoPath !== null });

const SESSION_INCLUDE = {
  classGrade: {
    select: {
      id: true,
      nameEn: true,
      nameAm: true,
      shortLabel: true,
      classType: { select: { id: true, nameEn: true, nameAm: true, departmentId: true } },
    },
  },
  department: { select: { id: true, nameEn: true, nameAm: true } },
  organiser: { select: { id: true, nameEn: true, nameAm: true } },
  serviceGroup: {
    select: {
      id: true,
      nameEn: true,
      nameAm: true,
      term: { select: { id: true, nameEn: true, nameAm: true } },
      classGrade: { select: { classType: { select: { departmentId: true } } } },
    },
  },
} satisfies Prisma.AttendanceSessionInclude;
type SessionRow = Prisma.AttendanceSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

type Audience = Pick<SessionRow, 'classGradeId' | 'departmentId' | 'serviceGroupId'>;

/**
 * The department that runs a session — whose admins and attendance takers
 * handle it: the department running its class (CLASS, SERVICE_GROUP), or the
 * organiser of an OTHER session. null = the office only.
 */
export function ownerDepartmentId(s: SessionRow): number | null {
  if (s.kind === AttendanceSessionKind.CLASS) return s.classGrade?.classType.departmentId ?? null;
  if (s.kind === AttendanceSessionKind.SERVICE_GROUP) {
    return s.serviceGroup?.classGrade?.classType.departmentId ?? null;
  }
  return s.organiserId;
}

/** Sessions a department-scoped user may see (same rule as ownerDepartmentId). */
export function sessionScopeWhere(scope: DepartmentScope): Prisma.AttendanceSessionWhereInput {
  if (scope === null) return {};
  const inDepartments = { departmentId: { in: scope } };
  return {
    OR: [
      { kind: AttendanceSessionKind.CLASS, classGrade: { classType: inDepartments } },
      {
        kind: AttendanceSessionKind.SERVICE_GROUP,
        serviceGroup: { classGrade: { classType: inDepartments } },
      },
      { kind: AttendanceSessionKind.OTHER, organiserId: { in: scope } },
    ],
  };
}

/**
 * Regular sessions (classes, service groups) have a roster: check-ins after
 * the grace period are Late, and closing marks everyone unmarked Absent.
 * OTHER sessions (gatherings, events) only record who came — always Present.
 */
export const isRegular = (kind: AttendanceSessionKind) => kind !== AttendanceSessionKind.OTHER;

/** Who is expected at a session: active members matching its audience. */
export function rosterWhere(s: Audience): Prisma.MemberWhereInput {
  return {
    deletedAt: null,
    status: MembershipStatus.ACTIVE,
    ...(s.classGradeId && { classEnrollments: { some: { classGradeId: s.classGradeId } } }),
    ...(s.departmentId && { departmentRoles: { some: { departmentId: s.departmentId } } }),
    ...(s.serviceGroupId && { serviceGroups: { some: { groupId: s.serviceGroupId } } }),
  };
}

@Injectable()
export class AttendanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Sessions close themselves when they end; checked every minute (and on every read). */
  onModuleInit() {
    this.timer = setInterval(() => {
      this.closeOverdue().catch((e: unknown) => this.logger.error(e));
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /**
   * Closes every open session whose end time has passed and that is set to
   * close automatically. Regular sessions get Absent for unmarked roster members.
   */
  async closeOverdue(): Promise<number> {
    const due = await this.prisma.attendanceSession.findMany({
      where: {
        status: AttendanceSessionStatus.OPEN,
        autoClose: true,
        endsAt: { lte: new Date() },
      },
      include: SESSION_INCLUDE,
    });
    for (const session of due) await this.closeRow(session, null, true);
    return due.length;
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async list(q: QuerySessionsDto, scope: DepartmentScope) {
    await this.closeOverdue();
    const where: Prisma.AttendanceSessionWhereInput = {
      ...sessionScopeWhere(scope),
      ...(q.kind && { kind: q.kind }),
      ...(q.status && { status: q.status }),
      ...(q.classGradeId && { classGradeId: q.classGradeId }),
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.serviceGroupId && { serviceGroupId: q.serviceGroupId }),
      ...((q.from || q.to) && {
        startsAt: {
          ...(q.from && { gte: addisDateTime(q.from, '00:00') }),
          ...(q.to && { lt: new Date(addisDateTime(q.to, '00:00').getTime() + 86_400_000) }),
        },
      }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.attendanceSession.count({ where }),
      this.prisma.attendanceSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: [{ startsAt: q.sortOrder }, { id: q.sortOrder }],
        skip: q.skip,
        take: q.pageSize,
      }),
    ]);
    const items = await Promise.all(rows.map((s) => this.withCounts(s)));
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  async findOne(id: number, scope: DepartmentScope) {
    return this.withCounts(await this.findRow(id, scope));
  }

  async create(dto: CreateSessionDto, userId: number, scope: DepartmentScope, anyDay = true) {
    assertDay(dto.date, anyDay);
    const data = await this.toSessionData(dto, dto.kind, scope);
    const session = await this.prisma.attendanceSession.create({
      // A session entered after it ended (catching up on the past) is closed by hand.
      data: { ...data, kind: dto.kind, createdById: userId, autoClose: data.endsAt > new Date() },
      include: SESSION_INCLUDE,
    });
    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'AttendanceSession',
      entityId: session.id,
    });
    return this.withCounts(session);
  }

  async update(
    id: number,
    dto: UpdateSessionDto,
    userId: number,
    scope: DepartmentScope,
    anyDay = true,
  ) {
    const current = await this.findRow(id, scope);
    assertDay(addisDateIso(current.startsAt), anyDay);
    if (dto.date) assertDay(dto.date, anyDay);
    const merged = {
      title: dto.title ?? current.title,
      date: dto.date ?? addisDateIso(current.startsAt),
      startTime: dto.startTime ?? addisTime(current.startsAt),
      endTime: dto.endTime ?? addisTime(current.endsAt),
      lateAfterMinutes: dto.lateAfterMinutes ?? current.lateAfterMinutes,
      classGradeId: dto.classGradeId !== undefined ? dto.classGradeId : current.classGradeId,
      departmentId: dto.departmentId !== undefined ? dto.departmentId : current.departmentId,
      serviceGroupId:
        dto.serviceGroupId !== undefined ? dto.serviceGroupId : current.serviceGroupId,
      organiserId: dto.organiserId !== undefined ? dto.organiserId : current.organiserId,
      location: dto.location !== undefined ? dto.location : current.location,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
    };
    const data = await this.toSessionData(merged, current.kind, scope, id);
    const session = await this.prisma.attendanceSession.update({
      where: { id },
      data: { ...data, autoClose: current.autoClose && data.endsAt > new Date() },
      include: SESSION_INCLUDE,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'AttendanceSession',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return this.withCounts(session);
  }

  async remove(id: number, userId: number, scope: DepartmentScope, anyDay = true): Promise<void> {
    assertDay(addisDateIso((await this.findRow(id, scope)).startsAt), anyDay);
    await this.prisma.attendanceSession.delete({ where: { id } });
    await this.audit.record({
      userId,
      action: 'DELETE',
      entity: 'AttendanceSession',
      entityId: id,
    });
  }

  /** Closing fills in Absent for everyone on the roster who was not marked, so the record is complete. */
  async close(id: number, userId: number, scope: DepartmentScope, anyDay = true) {
    const session = await this.findRow(id, scope);
    assertDay(addisDateIso(session.startsAt), anyDay);
    await this.closeRow(session, userId, false);
    return this.findOne(id, scope);
  }

  /**
   * Closing completes the record: regular sessions mark everyone on the roster
   * who wasn't marked as Absent; OTHER sessions only keep who came.
   * `userId` null = closed automatically at the end time.
   */
  private async closeRow(session: SessionRow, userId: number | null, automatic: boolean) {
    await this.prisma.$transaction((tx) => this.closeInTx(tx, session, userId, automatic));
  }

  /** closeRow inside a caller's transaction (the Excel import closes what it imports). */
  async closeInTx(
    tx: Prisma.TransactionClient,
    session: Audience & { id: number; kind: AttendanceSessionKind },
    userId: number | null,
    automatic: boolean,
  ): Promise<void> {
    // Claim the session first so two closers (a user and the timer) never both fill absences.
    const claimed = await tx.attendanceSession.updateMany({
      where: { id: session.id, status: AttendanceSessionStatus.OPEN },
      data: { status: AttendanceSessionStatus.CLOSED, closedAt: new Date() },
    });
    if (claimed.count === 0) return;
    let absent = 0;
    if (isRegular(session.kind)) {
      const unmarked = await tx.member.findMany({
        where: { ...rosterWhere(session), attendance: { none: { sessionId: session.id } } },
        select: { id: true },
      });
      absent = unmarked.length;
      if (absent > 0) {
        await tx.attendanceRecord.createMany({
          data: unmarked.map((m) => ({
            sessionId: session.id,
            memberId: m.id,
            status: AttendanceStatus.ABSENT,
            method: AttendanceMethod.MANUAL,
            recordedById: userId,
          })),
          skipDuplicates: true,
        });
      }
    }
    await this.audit.record(
      {
        userId,
        action: 'UPDATE',
        entity: 'AttendanceSession',
        entityId: session.id,
        changes: { closed: true, absent, ...(automatic && { automatic: true }) },
      },
      tx,
    );
  }

  async reopen(id: number, userId: number, scope: DepartmentScope, anyDay = true) {
    assertDay(addisDateIso((await this.findRow(id, scope)).startsAt), anyDay);
    await this.prisma.attendanceSession.update({
      where: { id },
      // Reopened to correct it: it stays open until someone closes it again.
      data: { status: AttendanceSessionStatus.OPEN, closedAt: null, autoClose: false },
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'AttendanceSession',
      entityId: id,
      changes: { reopened: true },
    });
    return this.findOne(id, scope);
  }

  // ── Roster & recording ───────────────────────────────────────────────────

  /**
   * Everyone expected (the live roster while open; the recorded snapshot once
   * closed) plus anyone recorded who is not on it (visitors), with their mark.
   */
  async roster(id: number, scope: DepartmentScope) {
    const session = await this.findRow(id, scope);
    const [records, rosterMembers] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { sessionId: id },
        select: {
          id: true,
          status: true,
          checkedInAt: true,
          method: true,
          note: true,
          inRoster: true,
          member: { select: MEMBER_SUMMARY },
        },
      }),
      session.status === AttendanceSessionStatus.OPEN
        ? this.prisma.member.findMany({ where: rosterWhere(session), select: MEMBER_SUMMARY })
        : Promise.resolve([] as MemberRow[]),
    ]);
    const byMember = new Map(records.map((r) => [r.member.id, r]));
    const rows = rosterMembers.map((m) => {
      const r = byMember.get(m.id);
      byMember.delete(m.id);
      return { member: toSummary(m), inRoster: true, record: r ? recordView(r) : null };
    });
    for (const r of byMember.values()) {
      rows.push({ member: toSummary(r.member), inRoster: r.inRoster, record: recordView(r) });
    }
    return rows.sort(
      (a, b) =>
        Number(b.inRoster) - Number(a.inRoster) ||
        a.member.firstName.localeCompare(b.member.firstName) ||
        a.member.fatherName.localeCompare(b.member.fatherName),
    );
  }

  /**
   * A QR scan (or typed / USB-scanner ID): marks Present, or Late after the
   * grace period. Scanning someone already marked present changes nothing.
   */
  async scan(id: number, code: string, userId: number, scope: DepartmentScope, anyDay = true) {
    const session = await this.openSession(id, scope);
    assertDay(addisDateIso(session.startsAt), anyDay);
    const memberCode = normalizeMemberCode(code);
    const member = await this.prisma.member.findFirst({
      where: { memberCode, deletedAt: null },
      select: MEMBER_SUMMARY,
    });
    if (!member) {
      throw new NotFoundException({
        message: `No member with ID ${memberCode}`,
        code: 'unknownMember',
        memberCode,
      });
    }
    // Only the session's own people are recorded by scanning; anyone else is just reported.
    if (!(await this.isInRoster(session, member.id))) {
      return { member: toSummary(member), record: null, alreadyRecorded: false, inRoster: false };
    }
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { sessionId_memberId: { sessionId: id, memberId: member.id } },
    });
    if (
      existing &&
      (existing.status === AttendanceStatus.PRESENT || existing.status === AttendanceStatus.LATE)
    ) {
      return {
        member: toSummary(member),
        record: recordView(existing),
        alreadyRecorded: true,
        inRoster: existing.inRoster,
      };
    }
    const now = new Date();
    // Present, or Late after the grace period; OTHER sessions only record Present.
    const status = isRegular(session.kind)
      ? statusForCheckIn(session.startsAt, session.lateAfterMinutes, now)
      : AttendanceStatus.PRESENT;
    const inRoster = true;
    const record = await this.prisma.attendanceRecord.upsert({
      where: { sessionId_memberId: { sessionId: id, memberId: member.id } },
      create: {
        sessionId: id,
        memberId: member.id,
        status,
        checkedInAt: now,
        method: AttendanceMethod.QR,
        inRoster,
        recordedById: userId,
      },
      update: {
        status,
        checkedInAt: now,
        method: AttendanceMethod.QR,
        note: null,
        recordedById: userId,
      },
    });
    return {
      member: toSummary(member),
      record: recordView(record),
      alreadyRecorded: false,
      inRoster,
    };
  }

  /** Manual mark from the roster checklist. */
  async mark(
    id: number,
    memberId: number,
    dto: MarkDto,
    userId: number,
    scope: DepartmentScope,
    anyDay = true,
  ) {
    const session = await this.openSession(id, scope);
    assertDay(addisDateIso(session.startsAt), anyDay);
    if (!isRegular(session.kind) && dto.status !== AttendanceStatus.PRESENT) {
      throw new ValidationFailedException([
        { field: 'status', messages: ['Gatherings and events only record who was present'] },
      ]);
    }
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true },
    });
    if (!member) throw new NotFoundException(`Member ${memberId} not found`);
    const inRoster = await this.isInRoster(session, memberId);
    const record = await this.prisma.attendanceRecord.upsert({
      where: { sessionId_memberId: { sessionId: id, memberId } },
      create: {
        sessionId: id,
        memberId,
        status: dto.status,
        method: AttendanceMethod.MANUAL,
        note: dto.note ?? null,
        inRoster,
        recordedById: userId,
      },
      // A scanned check-in time is kept if the status is only being corrected (e.g. Present → Late).
      update: { status: dto.status, note: dto.note ?? null, recordedById: userId },
    });
    return recordView(record);
  }

  async unmark(id: number, memberId: number, scope: DepartmentScope, anyDay = true): Promise<void> {
    assertDay(addisDateIso((await this.openSession(id, scope)).startsAt), anyDay);
    await this.prisma.attendanceRecord.deleteMany({ where: { sessionId: id, memberId } });
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  /** One member's attendance in a period: counts, rate, total time attended and every session. */
  async memberSummary(memberId: number, scope: DepartmentScope, from?: string, to?: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null, ...memberScopeWhere(scope) },
      select: { id: true },
    });
    if (!member) throw new NotFoundException(`Member ${memberId} not found`);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { memberId, session: { ...rangeWhere(from, to), ...sessionScopeWhere(scope) } },
      select: {
        status: true,
        checkedInAt: true,
        note: true,
        session: {
          select: {
            id: true,
            kind: true,
            title: true,
            startsAt: true,
            endsAt: true,
            lateAfterMinutes: true,
          },
        },
      },
      orderBy: { session: { startsAt: 'desc' } },
    });
    const counts = emptyCounts();
    let minutes = 0;
    for (const r of records) {
      addCount(counts, r.status);
      minutes += minutesAttended(r, r.session);
    }
    return {
      ...counts,
      sessions: records.length,
      rate: attendanceRate(counts),
      minutesAttended: minutes,
      // Every session in the period, newest first (a member has at most a few hundred a year).
      records: records.map((r) => ({
        sessionId: r.session.id,
        kind: r.session.kind,
        title: r.session.title,
        startsAt: r.session.startsAt,
        endsAt: r.session.endsAt,
        status: r.status,
        checkedInAt: r.checkedInAt,
        note: r.note,
        minutes: minutesAttended(r, r.session),
      })),
    };
  }

  /**
   * Members whose attendance rate is below the threshold over closed
   * sessions in the period (open sessions are incomplete, so excluded).
   */
  async lowAttendance(q: ReportQueryDto, scope: DepartmentScope) {
    const to = q.to ?? todayIso();
    const from = q.from ?? todayIso(new Date(dateOnly(to).getTime() - 90 * 86_400_000));
    const sessionWhere: Prisma.AttendanceSessionWhereInput = {
      ...rangeWhere(from, to),
      ...sessionScopeWhere(scope),
      status: AttendanceSessionStatus.CLOSED,
      // Only regular sessions have absences, so only they say anything about attendance rates.
      kind: q.kind && isRegular(q.kind) ? q.kind : { not: AttendanceSessionKind.OTHER },
      ...(q.classGradeId && { classGradeId: q.classGradeId }),
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.serviceGroupId && { serviceGroupId: q.serviceGroupId }),
    };
    const records = await this.prisma.attendanceRecord.findMany({
      where: { session: sessionWhere, member: { deletedAt: null } },
      select: {
        memberId: true,
        status: true,
        checkedInAt: true,
        session: { select: { startsAt: true, endsAt: true, lateAfterMinutes: true } },
      },
    });
    const perMember = new Map<
      number,
      { counts: StatusCounts; minutes: number; lastAttended: Date | null }
    >();
    for (const r of records) {
      const entry = perMember.get(r.memberId) ?? {
        counts: emptyCounts(),
        minutes: 0,
        lastAttended: null,
      };
      addCount(entry.counts, r.status);
      entry.minutes += minutesAttended(r, r.session);
      if (
        (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) &&
        (!entry.lastAttended || r.session.startsAt > entry.lastAttended)
      ) {
        entry.lastAttended = r.session.startsAt;
      }
      perMember.set(r.memberId, entry);
    }
    const flagged = [...perMember.entries()]
      .map(([memberId, e]) => ({ memberId, ...e, rate: attendanceRate(e.counts) }))
      .filter(
        (e) =>
          e.rate !== null &&
          e.rate < q.threshold &&
          e.counts.present + e.counts.late + e.counts.absent >= q.minSessions,
      );
    const members = await this.prisma.member.findMany({
      where: { id: { in: flagged.map((f) => f.memberId) } },
      select: MEMBER_SUMMARY,
    });
    const byId = new Map(members.map((m) => [m.id, toSummary(m)]));
    const rows = flagged
      .map((f) => ({
        member: byId.get(f.memberId)!,
        ...f.counts,
        rate: f.rate!,
        minutesAttended: f.minutes,
        lastAttended: f.lastAttended,
      }))
      .filter((r) => r.member);
    rows.sort((a, b) =>
      q.sort === 'name' ? a.member.firstName.localeCompare(b.member.firstName) : a.rate - b.rate,
    );
    return { from, to, threshold: q.threshold, minSessions: q.minSessions, members: rows };
  }

  /**
   * Who came most to the chosen sessions (events): ranked by sessions attended
   * (present or late), then rate, then time attended. Ties share a rank.
   */
  async topAttendance(q: TopAttendanceQueryDto, scope: DepartmentScope) {
    const ids = [...new Set(q.sessionIds)];
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { id: { in: ids }, ...sessionScopeWhere(scope) },
      select: { id: true, kind: true, title: true, startsAt: true, endsAt: true, status: true },
      orderBy: { startsAt: 'asc' },
    });
    if (sessions.length !== ids.length) {
      throw new ForbiddenException('Some of these sessions are not ones you can see.');
    }
    const records = await this.prisma.attendanceRecord.findMany({
      where: { sessionId: { in: ids }, member: { deletedAt: null } },
      select: {
        memberId: true,
        status: true,
        checkedInAt: true,
        session: { select: { startsAt: true, endsAt: true, lateAfterMinutes: true } },
      },
    });
    const perMember = new Map<number, { counts: StatusCounts; minutes: number }>();
    for (const r of records) {
      const entry = perMember.get(r.memberId) ?? { counts: emptyCounts(), minutes: 0 };
      addCount(entry.counts, r.status);
      entry.minutes += minutesAttended(r, r.session);
      perMember.set(r.memberId, entry);
    }
    const ranked = [...perMember.entries()]
      .map(([memberId, e]) => ({
        memberId,
        ...e,
        attended: e.counts.present + e.counts.late,
        rate: attendanceRate(e.counts),
      }))
      .filter((e) => e.attended > 0)
      .sort(
        (a, b) =>
          b.attended - a.attended ||
          (b.rate ?? 0) - (a.rate ?? 0) ||
          b.minutes - a.minutes ||
          a.memberId - b.memberId,
      );
    const top = ranked.slice(0, q.limit);
    const members = await this.prisma.member.findMany({
      where: { id: { in: top.map((t) => t.memberId) } },
      select: MEMBER_SUMMARY,
    });
    const byId = new Map(members.map((m) => [m.id, toSummary(m)]));
    let rank = 0;
    let previous: (typeof top)[number] | null = null;
    const rows = top.map((t, i) => {
      const tied =
        previous &&
        previous.attended === t.attended &&
        previous.rate === t.rate &&
        previous.minutes === t.minutes;
      if (!tied) rank = i + 1;
      previous = t;
      return {
        rank,
        member: byId.get(t.memberId)!,
        attended: t.attended,
        ...t.counts,
        rate: t.rate,
        minutesAttended: t.minutes,
      };
    });
    return { sessions, totalSessions: sessions.length, attendees: ranked.length, members: rows };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Loads a session the actor may work on; other departments' sessions are 403. */
  private async findRow(id: number, scope: DepartmentScope): Promise<SessionRow> {
    await this.closeOverdue();
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException(`Attendance session ${id} not found`);
    assertInScope(scope, ownerDepartmentId(session), 'This session belongs to another department.');
    return session;
  }

  private async openSession(id: number, scope: DepartmentScope) {
    const session = await this.findRow(id, scope);
    if (session.status !== AttendanceSessionStatus.OPEN) {
      throw new ConflictException({
        message: 'This session is closed. Reopen it to change attendance.',
        code: 'sessionClosed',
      });
    }
    return session;
  }

  private async isInRoster(session: Audience, memberId: number): Promise<boolean> {
    return (
      (await this.prisma.member.count({ where: { id: memberId, ...rosterWhere(session) } })) > 0
    );
  }

  /** Session + roster size + counts per status (closed sessions count their snapshot). */
  private async withCounts(session: SessionRow) {
    const open = session.status === AttendanceSessionStatus.OPEN;
    const [grouped, rosterSize, unmarked] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { sessionId: session.id },
        _count: { _all: true },
      }),
      open
        ? this.prisma.member.count({ where: rosterWhere(session) })
        : this.prisma.attendanceRecord.count({ where: { sessionId: session.id, inRoster: true } }),
      // Roster members with no mark yet. Visitors (not on the roster) never reduce this.
      open
        ? this.prisma.member.count({
            where: { ...rosterWhere(session), attendance: { none: { sessionId: session.id } } },
          })
        : Promise.resolve(0),
    ]);
    const counts = emptyCounts();
    for (const g of grouped) addCount(counts, g.status, g._count._all);
    return {
      ...session,
      ownerDepartmentId: ownerDepartmentId(session),
      rosterSize,
      counts,
      unmarked,
      rate: attendanceRate(counts),
    };
  }

  /** ownerDepartmentId() for a session that is about to be created or changed. */
  private async ownerOf(
    kind: AttendanceSessionKind,
    s: { classGradeId?: number | null; serviceGroupId?: number | null; organiserId: number | null },
  ): Promise<number | null> {
    if (kind === AttendanceSessionKind.OTHER) return s.organiserId;
    const gradeId =
      kind === AttendanceSessionKind.CLASS
        ? s.classGradeId
        : s.serviceGroupId
          ? (await this.prisma.serviceGroup.findUnique({ where: { id: s.serviceGroupId } }))
              ?.classGradeId
          : null;
    if (!gradeId) return null;
    const grade = await this.prisma.classGrade.findUnique({
      where: { id: gradeId },
      select: { classType: { select: { departmentId: true } } },
    });
    return grade?.classType.departmentId ?? null;
  }

  /** toSessionData for the Excel import: same validation and department rules. */
  prepareSessionData(
    dto: Omit<CreateSessionDto, 'kind'>,
    kind: AttendanceSessionKind,
    scope: DepartmentScope,
  ) {
    return this.toSessionData(dto, kind, scope);
  }

  /** Validates a session's audience and times and turns them into columns. */
  private async toSessionData(
    dto: Omit<CreateSessionDto, 'kind'>,
    kind: AttendanceSessionKind,
    scope: DepartmentScope,
    excludeId: number | null = null,
  ): Promise<
    Prisma.AttendanceSessionUncheckedCreateInput & Prisma.AttendanceSessionUncheckedUpdateInput
  > {
    const errors: { field: string; messages: string[] }[] = [];
    const startsAt = addisDateTime(dto.date, dto.startTime);
    const endsAt = addisDateTime(dto.date, dto.endTime);
    if (endsAt <= startsAt)
      errors.push({ field: 'endTime', messages: ['endTime must be after startTime'] });
    if (kind === AttendanceSessionKind.CLASS && !dto.classGradeId) {
      errors.push({ field: 'classGradeId', messages: ['A class session needs a class grade'] });
    }
    if (kind === AttendanceSessionKind.SERVICE_GROUP && !dto.serviceGroupId) {
      errors.push({
        field: 'serviceGroupId',
        messages: ['A service session needs a service group'],
      });
    }
    if (
      dto.serviceGroupId &&
      kind === AttendanceSessionKind.SERVICE_GROUP &&
      !(await this.prisma.serviceGroup.count({ where: { id: dto.serviceGroupId } }))
    ) {
      errors.push({ field: 'serviceGroupId', messages: ['Unknown service group'] });
    }
    if (
      dto.classGradeId &&
      !(await this.prisma.classGrade.count({ where: { id: dto.classGradeId } }))
    ) {
      errors.push({ field: 'classGradeId', messages: ['Unknown class grade'] });
    }
    if (
      dto.departmentId &&
      !(await this.prisma.department.count({ where: { id: dto.departmentId } }))
    ) {
      errors.push({ field: 'departmentId', messages: ['Unknown department'] });
    }
    // OTHER sessions are run by a department (null = the office). A department-scoped user
    // with a single department doesn't have to say which.
    const organiserId =
      kind !== AttendanceSessionKind.OTHER
        ? null
        : (dto.organiserId ?? (scope?.length === 1 ? scope[0]! : null));
    if (organiserId && !(await this.prisma.department.count({ where: { id: organiserId } }))) {
      errors.push({ field: 'organiserId', messages: ['Unknown department'] });
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    const isGroup = kind === AttendanceSessionKind.SERVICE_GROUP;
    if (scope !== null) {
      const owner = await this.ownerOf(kind, {
        classGradeId: dto.classGradeId,
        serviceGroupId: dto.serviceGroupId,
        organiserId,
      });
      assertInScope(scope, owner, 'You can only run attendance for your own department.');
    }
    // One class or group can't have two sessions at the same time (nor two
    // gatherings with the same title): scans would land in either.
    const twin = await this.prisma.attendanceSession.findFirst({
      where: {
        kind,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId !== null && { id: { not: excludeId } }),
        ...(kind === AttendanceSessionKind.CLASS && { classGradeId: dto.classGradeId }),
        ...(kind === AttendanceSessionKind.SERVICE_GROUP && {
          serviceGroupId: dto.serviceGroupId,
        }),
        ...(kind === AttendanceSessionKind.OTHER && { title: dto.title }),
      },
      select: { title: true },
    });
    if (twin) {
      throw new ValidationFailedException([
        {
          field: 'startTime',
          // Key + params: the web app shows it translated.
          messages: [`attendance.overlap|${JSON.stringify({ title: twin.title })}`],
        },
      ]);
    }
    return {
      kind,
      title: dto.title,
      startsAt,
      endsAt,
      lateAfterMinutes: dto.lateAfterMinutes ?? 15,
      // Only the audience that fits the kind is kept: CLASS → grade,
      // SERVICE_GROUP → the group alone, OTHER → any optional filters.
      classGradeId: isGroup ? null : (dto.classGradeId ?? null),
      departmentId: kind === AttendanceSessionKind.OTHER ? (dto.departmentId ?? null) : null,
      serviceGroupId: isGroup ? (dto.serviceGroupId ?? null) : null,
      organiserId,
      location: dto.location ?? null,
      notes: dto.notes ?? null,
    };
  }
}

function recordView(r: {
  id: number;
  status: AttendanceStatus;
  checkedInAt: Date | null;
  method: AttendanceMethod;
  note: string | null;
  inRoster: boolean;
}) {
  const { id, status, checkedInAt, method, note, inRoster } = r;
  return { id, status, checkedInAt, method, note, inRoster };
}

function rangeWhere(from?: string, to?: string): Prisma.AttendanceSessionWhereInput {
  if (!from && !to) return {};
  return {
    startsAt: {
      ...(from && { gte: addisDateTime(from, '00:00') }),
      ...(to && { lt: new Date(addisDateTime(to, '00:00').getTime() + 86_400_000) }),
    },
  };
}

const addisParts = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString();
export const addisDateIso = (d: Date) => addisParts(d).slice(0, 10);

/**
 * Attendance takers work on today's sessions only (Addis Ababa date);
 * creating or changing any other day needs attendance.any_day (department
 * and office admins).
 */
export function assertDay(date: string, anyDay: boolean): void {
  if (!anyDay && date !== todayIso()) {
    throw new ForbiddenException({
      message: "You can only work on today's attendance. A department admin can change other days.",
      code: 'notToday',
    });
  }
}
const addisTime = (d: Date) => addisParts(d).slice(11, 16);
