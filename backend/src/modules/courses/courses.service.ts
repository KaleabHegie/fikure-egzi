import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { assertInScope, inScope } from '../../common/auth/department-scope.js';
import { PERMISSIONS } from '../../common/auth/permissions.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { Paginated } from '../../common/pagination/paginated.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { dateOnly, today } from '../../common/utils/dates.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CourseDuration } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TEACHER } from '../users/users.service.js';
import type {
  CreateCourseDto,
  CreateOfferingDto,
  QueryCoursesDto,
  QueryOfferingsDto,
  SetAssessmentsDto,
  SetScoresDto,
  UpdateCourseDto,
  UpdateOfferingDto,
} from './dto/course.dto.js';

/** Ethiopian months are 30 days, so a run's default length is a whole number of days. */
export const DURATION_DAYS: Record<CourseDuration, number> = {
  THREE_MONTHS: 90,
  SIX_MONTHS: 180,
  ONE_YEAR: 365,
};

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The default last day of a run that starts on `start` (inclusive). */
export function defaultEndDate(start: string, duration: CourseDuration): string {
  return isoDate(new Date(dateOnly(start).getTime() + (DURATION_DAYS[duration] - 1) * DAY_MS));
}

export const formatCourseCode = (id: number) => `CRS-${String(id).padStart(5, '0')}`;

type Phase = 'upcoming' | 'ongoing' | 'finished';
function phaseOf(startDate: Date, endDate: Date, now = today()): Phase {
  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'finished';
  return 'ongoing';
}

const NAME = { id: true, nameEn: true, nameAm: true } as const;
const MEMBER_NAME = {
  id: true,
  memberCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  christianName: true,
  photoPath: true,
  updatedAt: true,
} as const;

const COURSE_SELECT = {
  id: true,
  courseCode: true,
  nameEn: true,
  nameAm: true,
  description: true,
  duration: true,
  passMark: true,
  departmentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  department: { select: NAME },
  _count: { select: { offerings: true } },
} satisfies Prisma.CourseSelect;
type CourseRow = Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>;
const toCourse = ({ _count, ...c }: CourseRow) => ({ ...c, offeringCount: _count.offerings });

const OFFERING_SELECT = {
  id: true,
  courseId: true,
  classGradeId: true,
  startDate: true,
  endDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  course: {
    select: {
      id: true,
      courseCode: true,
      nameEn: true,
      nameAm: true,
      duration: true,
      passMark: true,
      departmentId: true,
    },
  },
  classGrade: { select: { ...NAME, classType: { select: NAME } } },
  teachers: {
    select: { user: { select: { id: true, fullName: true, member: { select: MEMBER_NAME } } } },
    orderBy: { assignedAt: 'asc' },
  },
  assessments: {
    select: { id: true, name: true, maxScore: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.CourseOfferingSelect;
type OfferingRow = Prisma.CourseOfferingGetPayload<{ select: typeof OFFERING_SELECT }>;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_NAME }>;
const toMember = ({ photoPath, ...m }: MemberRow) => ({ ...m, hasPhoto: photoPath !== null });

const toOffering = (o: OfferingRow) => ({
  ...o,
  phase: phaseOf(o.startDate, o.endDate),
  teachers: o.teachers.map(({ user }) => ({
    id: user.id,
    fullName: user.fullName,
    member: user.member ? toMember(user.member) : null,
  })),
  assessments: o.assessments.map((a) => ({ ...a, maxScore: Number(a.maxScore) })),
  totalMax: o.assessments.reduce((sum, a) => sum + Number(a.maxScore), 0),
});

/**
 * Courses, their runs (a class grade, a period, its teachers), assessments and
 * marks. Course managers (the ትምህርት department) work within their
 * departments; teachers see and mark only the runs they teach.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Courses ──────────────────────────────────────────────────────────────

  async listCourses(q: QueryCoursesDto, actor: AuthenticatedUser) {
    const terms = (q.search ?? '').split(' ').filter(Boolean).slice(0, 5);
    const where: Prisma.CourseWhereInput = {
      ...this.courseScopeWhere(actor),
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.state && { isActive: q.state === 'active' }),
      ...(terms.length > 0 && {
        AND: terms.map((term) => ({
          OR: [
            { nameAm: { contains: term } },
            { nameEn: { contains: term } },
            { courseCode: { contains: term } },
          ],
        })),
      }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        select: COURSE_SELECT,
        orderBy: [{ isActive: 'desc' }, { courseCode: q.sortOrder }],
        skip: q.skip,
        take: q.pageSize,
      }),
    ]);
    return Paginated.of(rows.map(toCourse), total, q.page, q.pageSize);
  }

  async findCourse(id: number, actor: AuthenticatedUser) {
    return toCourse(await this.courseRow(id, actor));
  }

  async createCourse(dto: CreateCourseDto, actor: AuthenticatedUser) {
    assertInScope(
      actor.departmentIds,
      dto.departmentId,
      'You can only add courses to your own departments.',
    );
    await this.assertDepartment(dto.departmentId);
    const course = await this.prisma.$transaction(async (tx) => {
      // The code comes from the id: insert with a placeholder, then stamp it.
      const created = await tx.course.create({
        data: {
          ...dto,
          courseCode: `TMP-${randomUUID().slice(0, 12)}`,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: { id: true },
      });
      const row = await tx.course.update({
        where: { id: created.id },
        data: { courseCode: formatCourseCode(created.id) },
        select: COURSE_SELECT,
      });
      await this.audit.record(
        { userId: actor.id, action: 'CREATE', entity: 'Course', entityId: row.id },
        tx,
      );
      return row;
    });
    return toCourse(course);
  }

  async updateCourse(id: number, dto: UpdateCourseDto, actor: AuthenticatedUser) {
    await this.courseRow(id, actor);
    if (dto.departmentId !== undefined) {
      assertInScope(
        actor.departmentIds,
        dto.departmentId,
        'You can only hand courses to your own departments.',
      );
      await this.assertDepartment(dto.departmentId);
    }
    const row = await this.prisma.course.update({
      where: { id },
      data: { ...dto, updatedById: actor.id },
      select: COURSE_SELECT,
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'Course',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return toCourse(row);
  }

  /** Only courses that never ran can be deleted; others are made inactive. */
  async removeCourse(id: number, actor: AuthenticatedUser): Promise<void> {
    const course = await this.courseRow(id, actor);
    if (course._count.offerings > 0) {
      throw new ValidationFailedException([{ field: 'id', messages: ['courses.hasRuns'] }]);
    }
    await this.prisma.course.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: 'DELETE', entity: 'Course', entityId: id });
  }

  /** Teachers a manager may assign: active teacher accounts in their departments. */
  async teachers(actor: AuthenticatedUser) {
    const scope = actor.departmentIds;
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { code: TEACHER } } },
        ...(scope !== null && { departments: { some: { departmentId: { in: scope } } } }),
      },
      select: {
        id: true,
        fullName: true,
        member: { select: MEMBER_NAME },
        _count: { select: { teaching: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(({ member, _count, ...u }) => ({
      ...u,
      member: member ? toMember(member) : null,
      runCount: _count.teaching,
    }));
  }

  // ── Runs ─────────────────────────────────────────────────────────────────

  async listOfferings(q: QueryOfferingsDto, actor: AuthenticatedUser) {
    const now = today();
    const phase: Prisma.CourseOfferingWhereInput =
      q.phase === 'upcoming'
        ? { startDate: { gt: now } }
        : q.phase === 'finished'
          ? { endDate: { lt: now } }
          : q.phase === 'ongoing'
            ? { startDate: { lte: now }, endDate: { gte: now } }
            : {};
    const rows = await this.prisma.courseOffering.findMany({
      where: {
        ...this.offeringScopeWhere(actor, q.mine),
        ...(q.courseId && { courseId: q.courseId }),
        ...phase,
      },
      select: OFFERING_SELECT,
      orderBy: [
        { classGrade: { classType: { sortOrder: 'asc' } } },
        { classGrade: { sortOrder: 'asc' } },
        { startDate: 'desc' },
        { id: 'desc' },
      ],
      take: 500,
    });
    return rows.map(toOffering);
  }

  async findOffering(id: number, actor: AuthenticatedUser) {
    const row = await this.offeringRow(id, actor);
    return { ...toOffering(row), canManage: this.canManage(actor, row.course.departmentId) };
  }

  async createOffering(dto: CreateOfferingDto, actor: AuthenticatedUser) {
    const course = await this.courseRow(dto.courseId, actor);
    this.assertManager(actor, course.departmentId);
    if (!course.isActive) {
      throw new ValidationFailedException([{ field: 'courseId', messages: ['courses.inactive'] }]);
    }
    const data = await this.offeringData(dto, course, actor);
    await this.assertNoOverlap(dto.courseId, data.classGradeId, data.startDate, data.endDate);
    const row = await this.prisma.courseOffering.create({
      data: {
        courseId: dto.courseId,
        classGradeId: data.classGradeId,
        startDate: data.startDate,
        endDate: data.endDate,
        notes: dto.notes ?? null,
        createdById: actor.id,
        teachers: { create: data.teacherIds.map((userId) => ({ userId })) },
      },
      select: OFFERING_SELECT,
    });
    await this.audit.record({
      userId: actor.id,
      action: 'CREATE',
      entity: 'CourseOffering',
      entityId: row.id,
      changes: { courseId: dto.courseId, teacherIds: data.teacherIds },
    });
    return toOffering(row);
  }

  async updateOffering(id: number, dto: UpdateOfferingDto, actor: AuthenticatedUser) {
    const current = await this.offeringRow(id, actor);
    this.assertManager(actor, current.course.departmentId);
    if (dto.courseId !== undefined && dto.courseId !== current.courseId) {
      throw new ValidationFailedException([
        { field: 'courseId', messages: ['courses.courseFixed'] },
      ]);
    }
    const data = await this.offeringData(
      {
        classGradeId: dto.classGradeId ?? current.classGradeId,
        startDate: dto.startDate ?? isoDate(current.startDate),
        // A new start without an end moves the default end with it.
        endDate: dto.endDate ?? (dto.startDate ? undefined : isoDate(current.endDate)),
        teacherIds: dto.teacherIds ?? current.teachers.map((t) => t.user.id),
      },
      current.course,
      actor,
      current.classGradeId,
    );
    await this.assertNoOverlap(
      current.courseId,
      data.classGradeId,
      data.startDate,
      data.endDate,
      id,
    );
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.teacherIds !== undefined) {
        await tx.courseTeacher.deleteMany({ where: { offeringId: id } });
        await tx.courseTeacher.createMany({
          data: data.teacherIds.map((userId) => ({ offeringId: id, userId })),
        });
      }
      return tx.courseOffering.update({
        where: { id },
        data: {
          classGradeId: data.classGradeId,
          startDate: data.startDate,
          endDate: data.endDate,
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        select: OFFERING_SELECT,
      });
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'CourseOffering',
      entityId: id,
      changes: { fields: Object.keys(dto), teacherIds: dto.teacherIds },
    });
    return toOffering(row);
  }

  async removeOffering(id: number, actor: AuthenticatedUser): Promise<void> {
    const row = await this.offeringRow(id, actor);
    this.assertManager(actor, row.course.departmentId);
    // Deleting a run deletes its assessments and marks with it.
    await this.prisma.courseOffering.delete({ where: { id } });
    await this.audit.record({
      userId: actor.id,
      action: 'DELETE',
      entity: 'CourseOffering',
      entityId: id,
    });
  }

  // ── Assessments and marks ────────────────────────────────────────────────

  /** Replaces a run's assessment list (in order). Removed assessments lose their marks. */
  async setAssessments(id: number, dto: SetAssessmentsDto, actor: AuthenticatedUser) {
    const run = await this.offeringRow(id, actor);
    this.assertCanMark(actor, run);
    const total = dto.assessments.reduce((sum, a) => sum + a.maxScore, 0);
    if (total > 100 + 1e-9) {
      throw new ValidationFailedException([
        { field: 'assessments', messages: [`courses.totalOver|${JSON.stringify({ total })}`] },
      ]);
    }
    const names = dto.assessments.map((a) => a.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new ValidationFailedException([
        { field: 'assessments', messages: ['courses.duplicateAssessment'] },
      ]);
    }
    const existing = new Set(run.assessments.map((a) => a.id));
    if (dto.assessments.some((a) => a.id !== undefined && !existing.has(a.id))) {
      throw new ValidationFailedException([
        { field: 'assessments', messages: ['Unknown assessment'] },
      ]);
    }
    // Lowering a maximum below marks already given would leave impossible marks.
    for (const a of dto.assessments) {
      if (a.id === undefined) continue;
      const over = await this.prisma.courseScore.count({
        where: { assessmentId: a.id, score: { gt: a.maxScore } },
      });
      if (over > 0) {
        throw new ValidationFailedException([
          {
            field: 'assessments',
            messages: [`courses.maxBelowMarks|${JSON.stringify({ name: a.name })}`],
          },
        ]);
      }
    }
    const keep = dto.assessments.flatMap((a) => (a.id === undefined ? [] : [a.id]));
    await this.prisma.$transaction(async (tx) => {
      await tx.courseAssessment.deleteMany({ where: { offeringId: id, id: { notIn: keep } } });
      for (const [sortOrder, a] of dto.assessments.entries()) {
        if (a.id === undefined) {
          await tx.courseAssessment.create({
            data: { offeringId: id, name: a.name, maxScore: a.maxScore, sortOrder },
          });
        } else {
          await tx.courseAssessment.update({
            where: { id: a.id },
            data: { name: a.name, maxScore: a.maxScore, sortOrder },
          });
        }
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'CourseOffering',
      entityId: id,
      changes: { assessments: dto.assessments.map((a) => `${a.name} (${a.maxScore})`) },
    });
    return this.findOffering(id, actor);
  }

  /**
   * The mark sheet: every student of the run (members now in its grade, plus
   * anyone who already has marks) with their marks, total and result.
   */
  async gradebook(id: number, actor: AuthenticatedUser) {
    const run = await this.offeringRow(id, actor);
    const assessmentIds = run.assessments.map((a) => a.id);
    const [enrolled, scores] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where: { deletedAt: null, classEnrollments: { some: { classGradeId: run.classGradeId } } },
        select: MEMBER_NAME,
      }),
      this.prisma.courseScore.findMany({
        where: { assessmentId: { in: assessmentIds } },
        select: {
          assessmentId: true,
          memberId: true,
          score: true,
          member: { select: MEMBER_NAME },
        },
      }),
    ]);
    const students = new Map<number, MemberRow>();
    for (const m of enrolled) students.set(m.id, m);
    for (const s of scores) if (!students.has(s.memberId)) students.set(s.memberId, s.member);
    const enrolledIds = new Set(enrolled.map((m) => m.id));

    const offering = toOffering(run);
    const complete = offering.totalMax === 100;
    const rows = [...students.values()]
      .map((m) => {
        const marks: Record<number, number> = {};
        for (const s of scores) if (s.memberId === m.id) marks[s.assessmentId] = Number(s.score);
        const given = Object.keys(marks).length;
        const total = Object.values(marks).reduce((sum, v) => sum + v, 0);
        const finished = complete && given === assessmentIds.length && given > 0;
        return {
          member: toMember(m),
          inGrade: enrolledIds.has(m.id),
          marks,
          total: given > 0 ? Math.round(total * 100) / 100 : null,
          result: finished ? (total >= run.course.passMark ? 'PASS' : 'FAIL') : null,
        };
      })
      .sort((a, b) =>
        `${a.member.firstName} ${a.member.fatherName}`.localeCompare(
          `${b.member.firstName} ${b.member.fatherName}`,
        ),
      );
    return {
      offering: { ...offering, canManage: this.canManage(actor, run.course.departmentId) },
      students: rows,
    };
  }

  async setScores(id: number, dto: SetScoresDto, actor: AuthenticatedUser) {
    const run = await this.offeringRow(id, actor);
    this.assertCanMark(actor, run);
    const max = new Map(run.assessments.map((a) => [a.id, Number(a.maxScore)]));
    const memberIds = [...new Set(dto.scores.map((s) => s.memberId))];
    // Marks go to members now in the grade, or ones who already have marks here.
    const [enrolled, marked] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where: {
          id: { in: memberIds },
          deletedAt: null,
          classEnrollments: { some: { classGradeId: run.classGradeId } },
        },
        select: { id: true },
      }),
      this.prisma.courseScore.findMany({
        where: { memberId: { in: memberIds }, assessmentId: { in: [...max.keys()] } },
        select: { memberId: true },
        distinct: ['memberId'],
      }),
    ]);
    const students = new Set([...enrolled, ...marked].map((m) => ('id' in m ? m.id : m.memberId)));

    const problems: string[] = [];
    for (const s of dto.scores) {
      const limit = max.get(s.assessmentId);
      if (limit === undefined) problems.push('Unknown assessment');
      else if (!students.has(s.memberId)) problems.push('courses.notStudent');
      else if (s.score !== null && s.score > limit) {
        problems.push(`courses.scoreOverMax|${JSON.stringify({ max: limit })}`);
      }
    }
    if (problems.length > 0) {
      throw new ValidationFailedException([{ field: 'scores', messages: [...new Set(problems)] }]);
    }

    await this.prisma.$transaction(
      dto.scores.map((s) =>
        s.score === null
          ? this.prisma.courseScore.deleteMany({
              where: { assessmentId: s.assessmentId, memberId: s.memberId },
            })
          : this.prisma.courseScore.upsert({
              where: {
                assessmentId_memberId: { assessmentId: s.assessmentId, memberId: s.memberId },
              },
              create: {
                assessmentId: s.assessmentId,
                memberId: s.memberId,
                score: s.score,
                updatedById: actor.id,
              },
              update: { score: s.score, updatedById: actor.id },
            }),
      ),
    );
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'CourseOffering',
      entityId: id,
      changes: { marks: dto.scores.length },
    });
    return this.gradebook(id, actor);
  }

  /** Checks that the actor may create or import marks for this run. */
  async assertMarker(id: number, actor: AuthenticatedUser) {
    const run = await this.offeringRow(id, actor);
    this.assertCanMark(actor, run);
  }

  /**
   * A member's courses (member detail page and the member portal):
   * `taking` — runs they have marks in, plus current and upcoming runs of the
   * class grades they're in; `teaching` — current and upcoming runs they teach.
   */
  async memberCourses(memberId: number) {
    const now = today();
    const [taking, teaching] = await Promise.all([
      this.memberResults(memberId, now),
      this.prisma.courseOffering.findMany({
        where: {
          endDate: { gte: now },
          teachers: { some: { user: { memberId, isActive: true } } },
        },
        select: {
          ...OFFERING_SELECT,
          classGrade: {
            select: {
              ...NAME,
              classType: { select: NAME },
              _count: { select: { enrollments: true } },
            },
          },
        },
        orderBy: { startDate: 'asc' },
      }),
    ]);
    return {
      taking,
      teaching: teaching.map((run) => {
        const offering = toOffering(run);
        return {
          id: run.id,
          course: run.course,
          classGrade: run.classGrade,
          startDate: run.startDate,
          endDate: run.endDate,
          phase: offering.phase,
          teachers: offering.teachers,
          students: run.classGrade._count.enrollments,
        };
      }),
    };
  }

  private async memberResults(memberId: number, now: Date) {
    const runs = await this.prisma.courseOffering.findMany({
      where: {
        OR: [
          { assessments: { some: { scores: { some: { memberId } } } } },
          {
            endDate: { gte: now },
            classGrade: { enrollments: { some: { memberId, member: { deletedAt: null } } } },
          },
        ],
      },
      select: {
        ...OFFERING_SELECT,
        assessments: {
          select: {
            id: true,
            name: true,
            maxScore: true,
            sortOrder: true,
            scores: { where: { memberId }, select: { score: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { startDate: 'desc' },
    });
    return runs.map((run) => {
      const offering = toOffering(run);
      const marks = run.assessments.map((a) => ({
        id: a.id,
        name: a.name,
        maxScore: Number(a.maxScore),
        score: a.scores[0] ? Number(a.scores[0].score) : null,
      }));
      const given = marks.filter((m) => m.score !== null);
      const total = given.reduce((sum, m) => sum + (m.score ?? 0), 0);
      const finished = offering.totalMax === 100 && given.length === marks.length;
      return {
        id: run.id,
        course: run.course,
        classGrade: run.classGrade,
        startDate: run.startDate,
        endDate: run.endDate,
        phase: offering.phase,
        teachers: offering.teachers,
        marks,
        total: given.length > 0 ? Math.round(total * 100) / 100 : null,
        totalMax: offering.totalMax,
        result: finished ? (total >= run.course.passMark ? 'PASS' : 'FAIL') : null,
      };
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private isManager(actor: AuthenticatedUser) {
    return actor.permissions.includes(PERMISSIONS.COURSES_MANAGE);
  }

  private canManage(actor: AuthenticatedUser, departmentId: number) {
    return this.isManager(actor) && inScope(actor.departmentIds, departmentId);
  }

  private assertManager(actor: AuthenticatedUser, departmentId: number) {
    if (!this.canManage(actor, departmentId)) {
      throw new ForbiddenException(
        'Only the course department can schedule runs and assign teachers.',
      );
    }
  }

  /** Managers of the course's department, or a teacher of an active run. */
  private assertCanMark(actor: AuthenticatedUser, run: OfferingRow) {
    const manager = this.canManage(actor, run.course.departmentId);
    if (phaseOf(run.startDate, run.endDate) === 'finished' && !manager) {
      throw new ForbiddenException(
        'Only the course department head can update assessments or marks after a course run is closed.',
      );
    }
    const teaches =
      actor.permissions.includes(PERMISSIONS.COURSES_TEACH) &&
      run.teachers.some((t) => t.user.id === actor.id);
    if (!teaches && !manager) {
      throw new ForbiddenException('Only the teachers of this course can enter its marks.');
    }
  }

  /** Managers see their departments' courses; teachers see the courses they teach. */
  private courseScopeWhere(actor: AuthenticatedUser): Prisma.CourseWhereInput {
    if (!this.isManager(actor))
      return { offerings: { some: { teachers: { some: { userId: actor.id } } } } };
    return actor.departmentIds === null ? {} : { departmentId: { in: actor.departmentIds } };
  }

  private offeringScopeWhere(
    actor: AuthenticatedUser,
    mine?: boolean,
  ): Prisma.CourseOfferingWhereInput {
    if (mine || !this.isManager(actor)) return { teachers: { some: { userId: actor.id } } };
    return actor.departmentIds === null
      ? {}
      : { course: { departmentId: { in: actor.departmentIds } } };
  }

  private async courseRow(id: number, actor: AuthenticatedUser): Promise<CourseRow> {
    const row = await this.prisma.course.findFirst({
      where: { id, ...this.courseScopeWhere(actor) },
      select: COURSE_SELECT,
    });
    if (!row) throw new NotFoundException(`Course ${id} not found`);
    return row;
  }

  private async offeringRow(id: number, actor: AuthenticatedUser): Promise<OfferingRow> {
    const row = await this.prisma.courseOffering.findFirst({
      where: { id, ...this.offeringScopeWhere(actor) },
      select: OFFERING_SELECT,
    });
    if (!row) throw new NotFoundException(`Course run ${id} not found`);
    return row;
  }

  /** Validates grade, dates and teachers of a run. */
  private async offeringData(
    dto: { classGradeId?: number; startDate?: string; endDate?: string; teacherIds?: number[] },
    course: { duration: CourseDuration; departmentId: number },
    actor: AuthenticatedUser,
    currentGradeId?: number,
  ) {
    const { duration } = course;
    const grade = await this.prisma.classGrade.findUnique({
      where: { id: dto.classGradeId ?? 0 },
      select: { id: true, classType: { select: { departmentId: true } } },
    });
    if (!grade) {
      throw new ValidationFailedException([
        { field: 'classGradeId', messages: ['Unknown class grade'] },
      ]);
    }
    // A course is taught to the classes of its own department (a run keeps the grade it already has).
    if (grade.classType.departmentId !== course.departmentId && grade.id !== currentGradeId) {
      throw new ValidationFailedException([
        { field: 'classGradeId', messages: ['courses.gradeOutsideDepartment'] },
      ]);
    }
    const start = dto.startDate!;
    const end = dto.endDate ?? defaultEndDate(start, duration);
    if (end < start) {
      throw new ValidationFailedException([
        { field: 'endDate', messages: ['courses.endBeforeStart'] },
      ]);
    }
    const teacherIds = [...new Set(dto.teacherIds ?? [])];
    if (teacherIds.length === 0) {
      throw new ValidationFailedException([
        { field: 'teacherIds', messages: ['courses.chooseTeacher'] },
      ]);
    }
    const allowed = new Set((await this.teachers(actor)).map((t) => t.id));
    if (teacherIds.some((t) => !allowed.has(t))) {
      throw new ValidationFailedException([
        { field: 'teacherIds', messages: ['courses.unknownTeacher'] },
      ]);
    }
    return {
      classGradeId: grade.id,
      startDate: dateOnly(start),
      endDate: dateOnly(end),
      teacherIds,
    };
  }

  /** The same course can't run twice for one grade at the same time. */
  private async assertNoOverlap(
    courseId: number,
    classGradeId: number,
    startDate: Date,
    endDate: Date,
    exceptId?: number,
  ) {
    const twin = await this.prisma.courseOffering.findFirst({
      where: {
        courseId,
        classGradeId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (twin) {
      throw new ValidationFailedException([{ field: 'startDate', messages: ['courses.overlap'] }]);
    }
  }

  private async assertDepartment(departmentId: number) {
    if (!(await this.prisma.department.count({ where: { id: departmentId } }))) {
      throw new ValidationFailedException([
        { field: 'departmentId', messages: ['Unknown department'] },
      ]);
    }
  }
}
