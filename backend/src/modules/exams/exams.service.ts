import { Injectable, NotFoundException } from '@nestjs/common';
import {
  assertInScope,
  type DepartmentScope,
  inScope,
} from '../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { dateOnly } from '../../common/utils/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  AddCandidatesDto,
  CreateExamDto,
  ExamPartDto,
  QueryExamsDto,
  SetExamMarksDto,
  SetExamPartsDto,
  UpdateExamDto,
} from './dto/exam.dto.js';

const ENTITY = 'Exam';
const OWN_DEPARTMENT = 'You can only manage the exams of your own departments.';

const MEMBER_NAME = {
  id: true,
  memberCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  christianName: true,
  photoPath: true,
  updatedAt: true,
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_NAME }>;
const toMember = ({ photoPath, ...m }: MemberRow) => ({ ...m, hasPhoto: photoPath !== null });

const EXAM_SELECT = {
  id: true,
  departmentId: true,
  nameAm: true,
  nameEn: true,
  description: true,
  heldOn: true,
  passMark: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, nameAm: true, nameEn: true } },
  parts: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, weight: true, sortOrder: true },
  },
  _count: { select: { candidates: true } },
} satisfies Prisma.ExamSelect;

type ExamRow = Prisma.ExamGetPayload<{ select: typeof EXAM_SELECT }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

const toExam = ({ _count, parts, ...e }: ExamRow) => {
  const outParts = parts.map((p) => ({ ...p, weight: Number(p.weight) }));
  return {
    ...e,
    parts: outParts,
    totalWeight: round2(outParts.reduce((sum, p) => sum + p.weight, 0)),
    candidateCount: _count.candidates,
  };
};

/**
 * A department's own exams and assessments (e.g. the Mezmur department's St.
 * John wereb assessment): free parts with weights, chosen candidates, and a
 * mark per candidate per part. Department admins manage only their own
 * departments' exams.
 */
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Exams the actor can see, newest first, with how far marking has got. */
  async list(q: QueryExamsDto, actor: AuthenticatedUser) {
    const scope = actor.departmentIds;
    const search = q.search?.trim();
    const exams = await this.prisma.exam.findMany({
      where: {
        ...(scope !== null && { departmentId: { in: scope } }),
        ...(q.departmentId && { departmentId: q.departmentId }),
        ...(search && {
          OR: [{ nameAm: { contains: search } }, { nameEn: { contains: search } }],
        }),
      },
      orderBy: [{ heldOn: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
      select: EXAM_SELECT,
    });
    const progress = await this.progress(exams.map(toExam));
    return exams.map((row) => {
      const exam = toExam(row);
      return { ...exam, ...progress.get(exam.id), canManage: inScope(scope, exam.departmentId) };
    });
  }

  async findOne(id: number, actor: AuthenticatedUser) {
    const row = await this.row(id, actor.departmentIds);
    const exam = toExam(row);
    return {
      ...exam,
      ...(await this.progress([exam])).get(exam.id),
      canManage: inScope(actor.departmentIds, exam.departmentId),
    };
  }

  async create(dto: CreateExamDto, actor: AuthenticatedUser) {
    assertInScope(actor.departmentIds, dto.departmentId, OWN_DEPARTMENT);
    await this.assertDepartment(dto.departmentId);
    const { parts, heldOn, ...fields } = dto;
    if (parts) this.assertParts(parts);
    const exam = await this.prisma.exam.create({
      data: {
        ...fields,
        heldOn: heldOn ? dateOnly(heldOn) : null,
        createdById: actor.id,
        updatedById: actor.id,
        ...(parts && {
          parts: {
            create: parts.map((p, sortOrder) => ({ name: p.name, weight: p.weight, sortOrder })),
          },
        }),
      },
      select: { id: true },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'CREATE',
      entity: ENTITY,
      entityId: exam.id,
      changes: { name: dto.nameAm, departmentId: dto.departmentId },
    });
    return this.findOne(exam.id, actor);
  }

  async update(id: number, dto: UpdateExamDto, actor: AuthenticatedUser) {
    await this.managed(id, actor);
    if (dto.departmentId !== undefined) {
      assertInScope(actor.departmentIds, dto.departmentId, OWN_DEPARTMENT);
      await this.assertDepartment(dto.departmentId);
    }
    const { heldOn, ...fields } = dto;
    await this.prisma.exam.update({
      where: { id },
      data: {
        ...fields,
        ...(heldOn !== undefined && { heldOn: heldOn ? dateOnly(heldOn) : null }),
        updatedById: actor.id,
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return this.findOne(id, actor);
  }

  /** Removes the exam with its parts, candidates and marks. */
  async remove(id: number, actor: AuthenticatedUser): Promise<void> {
    const exam = await this.managed(id, actor);
    await this.prisma.exam.delete({ where: { id } });
    await this.audit.record({
      userId: actor.id,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      changes: { name: exam.nameAm },
    });
  }

  // ── Parts ────────────────────────────────────────────────────────────────

  /** Replaces the exam's parts (in order). A removed part loses its marks. */
  async setParts(id: number, dto: SetExamPartsDto, actor: AuthenticatedUser) {
    const exam = await this.managed(id, actor);
    this.assertParts(dto.parts);
    const existing = new Set(exam.parts.map((p) => p.id));
    if (dto.parts.some((p) => p.id !== undefined && !existing.has(p.id))) {
      throw new ValidationFailedException([{ field: 'parts', messages: ['Unknown part'] }]);
    }
    // Lowering a weight below marks already given would leave impossible marks.
    for (const p of dto.parts) {
      if (p.id === undefined) continue;
      const over = await this.prisma.examMark.count({
        where: { partId: p.id, score: { gt: p.weight } },
      });
      if (over > 0) {
        throw new ValidationFailedException([
          {
            field: 'parts',
            messages: [`exams.weightBelowMarks|${JSON.stringify({ name: p.name })}`],
          },
        ]);
      }
    }
    const keep = dto.parts.flatMap((p) => (p.id === undefined ? [] : [p.id]));
    await this.prisma.$transaction(async (tx) => {
      await tx.examPart.deleteMany({ where: { examId: id, id: { notIn: keep } } });
      for (const [sortOrder, p] of dto.parts.entries()) {
        if (p.id === undefined) {
          await tx.examPart.create({
            data: { examId: id, name: p.name, weight: p.weight, sortOrder },
          });
        } else {
          await tx.examPart.update({
            where: { id: p.id },
            data: { name: p.name, weight: p.weight, sortOrder },
          });
        }
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { parts: dto.parts.map((p) => `${p.name} (${p.weight}%)`) },
    });
    return this.findOne(id, actor);
  }

  // ── Candidates and marks ─────────────────────────────────────────────────

  /**
   * The mark sheet: each candidate with their marks, total and result. The
   * result is given once the weights add up to 100 and every part is marked.
   */
  async sheet(id: number, actor: AuthenticatedUser) {
    const exam = await this.findOne(id, actor);
    const partIds = exam.parts.map((p) => p.id);
    const [candidates, marks] = await this.prisma.$transaction([
      this.prisma.examCandidate.findMany({
        where: { examId: id, member: { deletedAt: null } },
        select: { member: { select: MEMBER_NAME } },
      }),
      this.prisma.examMark.findMany({
        where: { partId: { in: partIds } },
        select: { partId: true, memberId: true, score: true },
      }),
    ]);
    const byMember = new Map<number, Record<number, number>>();
    for (const m of marks) {
      const row = byMember.get(m.memberId) ?? {};
      row[m.partId] = Number(m.score);
      byMember.set(m.memberId, row);
    }
    const rows = candidates
      .map(({ member }) => {
        const given = byMember.get(member.id) ?? {};
        return { member: toMember(member), marks: given, ...this.result(exam, given) };
      })
      .sort((a, b) =>
        `${a.member.firstName} ${a.member.fatherName}`.localeCompare(
          `${b.member.firstName} ${b.member.fatherName}`,
        ),
      );
    return { exam, candidates: rows };
  }

  /** Adds individual members, a whole class grade, and/or a department's roster. */
  async addCandidates(id: number, dto: AddCandidatesDto, actor: AuthenticatedUser) {
    await this.managed(id, actor);
    const ors: Prisma.MemberWhereInput[] = [];
    if (dto.memberIds?.length) ors.push({ id: { in: dto.memberIds } });
    if (dto.classGradeId)
      ors.push({ classEnrollments: { some: { classGradeId: dto.classGradeId } } });
    if (dto.departmentId)
      ors.push({ departmentRoles: { some: { departmentId: dto.departmentId } } });
    if (ors.length === 0) {
      throw new ValidationFailedException([
        { field: 'memberIds', messages: ['exams.chooseCandidates'] },
      ]);
    }
    const members = await this.prisma.member.findMany({
      where: { deletedAt: null, OR: ors },
      select: { id: true },
    });
    const { count } = await this.prisma.examCandidate.createMany({
      data: members.map((m) => ({ examId: id, memberId: m.id, addedById: actor.id })),
      skipDuplicates: true,
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { candidatesAdded: count },
    });
    return { added: count, ...(await this.sheet(id, actor)) };
  }

  /** Takes a member off the exam, with their marks in it. */
  async removeCandidate(id: number, memberId: number, actor: AuthenticatedUser) {
    const exam = await this.managed(id, actor);
    await this.prisma.$transaction([
      this.prisma.examMark.deleteMany({
        where: { memberId, partId: { in: exam.parts.map((p) => p.id) } },
      }),
      this.prisma.examCandidate.deleteMany({ where: { examId: id, memberId } }),
    ]);
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { candidateRemoved: memberId },
    });
    return this.sheet(id, actor);
  }

  /** Members to add one by one: any current member, by name, code or phone. */
  async candidateSearch(id: number, search: string, actor: AuthenticatedUser) {
    await this.managed(id, actor);
    const terms = search.split(/\s+/).filter(Boolean).slice(0, 4);
    if (terms.length === 0) return [];
    const [members, already] = await Promise.all([
      this.prisma.member.findMany({
        where: {
          deletedAt: null,
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term } },
              { fatherName: { contains: term } },
              { grandfatherName: { contains: term } },
              { memberCode: { contains: term } },
              { phone: { contains: term } },
            ],
          })),
        },
        take: 20,
        orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
        select: MEMBER_NAME,
      }),
      this.prisma.examCandidate.findMany({ where: { examId: id }, select: { memberId: true } }),
    ]);
    const taken = new Set(already.map((c) => c.memberId));
    return members.map((m) => ({ ...toMember(m), isCandidate: taken.has(m.id) }));
  }

  async setMarks(id: number, dto: SetExamMarksDto, actor: AuthenticatedUser) {
    const exam = await this.managed(id, actor);
    const weight = new Map(exam.parts.map((p) => [p.id, Number(p.weight)]));
    const memberIds = [...new Set(dto.marks.map((m) => m.memberId))];
    const candidates = new Set(
      (
        await this.prisma.examCandidate.findMany({
          where: { examId: id, memberId: { in: memberIds } },
          select: { memberId: true },
        })
      ).map((c) => c.memberId),
    );
    const problems: string[] = [];
    for (const m of dto.marks) {
      const max = weight.get(m.partId);
      if (max === undefined) problems.push('Unknown part');
      else if (!candidates.has(m.memberId)) problems.push('exams.notCandidate');
      else if (m.score !== null && m.score > max) {
        problems.push(`exams.scoreOverWeight|${JSON.stringify({ max })}`);
      }
    }
    if (problems.length > 0) {
      throw new ValidationFailedException([{ field: 'marks', messages: [...new Set(problems)] }]);
    }
    await this.prisma.$transaction(
      dto.marks.map((m) =>
        m.score === null
          ? this.prisma.examMark.deleteMany({ where: { partId: m.partId, memberId: m.memberId } })
          : this.prisma.examMark.upsert({
              where: { partId_memberId: { partId: m.partId, memberId: m.memberId } },
              create: {
                partId: m.partId,
                memberId: m.memberId,
                score: m.score,
                updatedById: actor.id,
              },
              update: { score: m.score, updatedById: actor.id },
            }),
      ),
    );
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { marks: dto.marks.length },
    });
    return this.sheet(id, actor);
  }

  /** A member's exams and results (member page), limited to what the actor may see. */
  async memberExams(memberId: number, scope: DepartmentScope) {
    const rows = await this.prisma.exam.findMany({
      where: {
        candidates: { some: { memberId } },
        ...(scope !== null && { departmentId: { in: scope } }),
      },
      orderBy: [{ heldOn: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
      select: EXAM_SELECT,
    });
    const exams = rows.map(toExam);
    const marks = await this.prisma.examMark.findMany({
      where: { memberId, partId: { in: exams.flatMap((e) => e.parts.map((p) => p.id)) } },
      select: { partId: true, score: true },
    });
    const given: Record<number, number> = Object.fromEntries(
      marks.map((m) => [m.partId, Number(m.score)]),
    );
    return exams.map((exam) => {
      const mine = Object.fromEntries(
        exam.parts.filter((p) => p.id in given).map((p) => [p.id, given[p.id]!]),
      );
      return {
        id: exam.id,
        nameAm: exam.nameAm,
        nameEn: exam.nameEn,
        heldOn: exam.heldOn,
        passMark: exam.passMark,
        department: exam.department,
        parts: exam.parts.map((p) => ({ ...p, score: mine[p.id] ?? null })),
        ...this.result(exam, mine),
      };
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Total so far and PASS/FAIL once the exam is complete and fully marked. */
  private result(
    exam: { parts: { id: number }[]; totalWeight: number; passMark: number },
    marks: Record<number, number>,
  ) {
    const given = exam.parts.filter((p) => p.id in marks);
    const total = round2(given.reduce((sum, p) => sum + marks[p.id]!, 0));
    const finished =
      exam.totalWeight === 100 && given.length === exam.parts.length && given.length > 0;
    return {
      total: given.length > 0 ? total : null,
      result: finished ? ((total >= exam.passMark ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL') : null,
    };
  }

  /** Per exam: candidates fully marked, and how many of them passed. */
  private async progress(exams: ReturnType<typeof toExam>[]) {
    const out = new Map<number, { markedCount: number; passedCount: number }>();
    const partIds = exams.flatMap((e) => e.parts.map((p) => p.id));
    const marks = partIds.length
      ? await this.prisma.examMark.findMany({
          where: { partId: { in: partIds }, member: { deletedAt: null } },
          select: { partId: true, memberId: true, score: true },
        })
      : [];
    const examOfPart = new Map(exams.flatMap((e) => e.parts.map((p) => [p.id, e.id] as const)));
    const byExamMember = new Map<string, Record<number, number>>();
    for (const m of marks) {
      const key = `${examOfPart.get(m.partId)}:${m.memberId}`;
      const row = byExamMember.get(key) ?? {};
      row[m.partId] = Number(m.score);
      byExamMember.set(key, row);
    }
    for (const exam of exams) {
      let markedCount = 0;
      let passedCount = 0;
      for (const [key, given] of byExamMember) {
        if (!key.startsWith(`${exam.id}:`)) continue;
        const { result } = this.result(exam, given);
        if (result) markedCount += 1;
        if (result === 'PASS') passedCount += 1;
      }
      out.set(exam.id, { markedCount, passedCount });
    }
    return out;
  }

  /** Weights add up to at most 100, and part names are distinct. */
  private assertParts(parts: ExamPartDto[]) {
    const total = round2(parts.reduce((sum, p) => sum + p.weight, 0));
    if (total > 100) {
      throw new ValidationFailedException([
        { field: 'parts', messages: [`exams.totalOver|${JSON.stringify({ total })}`] },
      ]);
    }
    const names = parts.map((p) => p.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new ValidationFailedException([{ field: 'parts', messages: ['exams.duplicatePart'] }]);
    }
  }

  private async row(id: number, scope: DepartmentScope) {
    const row = await this.prisma.exam.findFirst({
      where: { id, ...(scope !== null && { departmentId: { in: scope } }) },
      select: EXAM_SELECT,
    });
    if (!row) throw new NotFoundException(`Exam ${id} not found`);
    return row;
  }

  /** An exam the actor may change (its department is theirs). */
  private async managed(id: number, actor: AuthenticatedUser) {
    const row = await this.row(id, actor.departmentIds);
    assertInScope(actor.departmentIds, row.departmentId, OWN_DEPARTMENT);
    return row;
  }

  private async assertDepartment(departmentId: number) {
    if (!(await this.prisma.department.count({ where: { id: departmentId } }))) {
      throw new ValidationFailedException([
        { field: 'departmentId', messages: ['Unknown department'] },
      ]);
    }
  }
}
