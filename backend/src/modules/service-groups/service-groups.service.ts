import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertInScope,
  type DepartmentScope,
  memberScopeWhere,
} from '../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { dateOnly } from '../../common/utils/dates.js';
import { Prisma } from '../../generated/prisma/client.js';
import { MembershipStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CandidatesQueryDto,
  CreateGroupDto,
  CreateTermDto,
  DistributeDto,
  UpdateGroupDto,
  UpdateTermDto,
} from './dto/service-groups.dto.js';

const MEMBER_SUMMARY = {
  id: true,
  memberCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  christianName: true,
  photoPath: true,
  updatedAt: true,
} satisfies Prisma.MemberSelect;
type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SUMMARY }>;
const toSummary = ({ photoPath, ...m }: MemberRow) => ({ ...m, hasPhoto: photoPath !== null });

const GRADE_SELECT = {
  id: true,
  nameEn: true,
  nameAm: true,
  shortLabel: true,
  classType: { select: { id: true, nameEn: true, nameAm: true } },
} satisfies Prisma.ClassGradeSelect;

/**
 * Service groups: Mezmur students' service rotations. Each term (usually a
 * year) has its own groups, and a member is in at most one group per term,
 * so reorganising next year never rewrites this year's history.
 */
@Injectable()
export class ServiceGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Terms ────────────────────────────────────────────────────────────────

  async listTerms() {
    const terms = await this.prisma.serviceTerm.findMany({
      orderBy: [{ startsOn: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { groups: true, members: true } } },
    });
    return terms.map(({ _count, ...t }) => ({
      ...t,
      groupCount: _count.groups,
      memberCount: _count.members,
    }));
  }

  async createTerm(dto: CreateTermDto, userId: number, scope: DepartmentScope = null) {
    await this.assertManagesTerms(scope);
    this.assertDates(dto.startsOn, dto.endsOn);
    const makeCurrent = dto.isCurrent ?? true;
    const term = await this.prisma.$transaction(async (tx) => {
      if (makeCurrent) await tx.serviceTerm.updateMany({ data: { isCurrent: false } });
      const created = await tx.serviceTerm.create({
        data: {
          nameEn: dto.nameEn,
          nameAm: dto.nameAm,
          startsOn: dateOnly(dto.startsOn),
          endsOn: dateOnly(dto.endsOn),
          isCurrent: makeCurrent,
        },
      });
      if (dto.copyFromTermId) {
        const source = await tx.serviceGroup.findMany({
          where: { termId: dto.copyFromTermId },
          orderBy: { sortOrder: 'asc' },
          include: {
            members: { select: { memberId: true, member: { select: { deletedAt: true } } } },
          },
        });
        for (const g of source) {
          const group = await tx.serviceGroup.create({
            data: {
              termId: created.id,
              nameEn: g.nameEn,
              nameAm: g.nameAm,
              classGradeId: g.classGradeId,
              notes: g.notes,
              sortOrder: g.sortOrder,
            },
          });
          if (dto.copyMembers) {
            const memberIds = g.members.filter((m) => !m.member.deletedAt).map((m) => m.memberId);
            if (memberIds.length > 0) {
              await tx.serviceGroupMember.createMany({
                data: memberIds.map((memberId) => ({
                  termId: created.id,
                  groupId: group.id,
                  memberId,
                  assignedById: userId,
                })),
              });
            }
          }
        }
      }
      return created;
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'ServiceTerm', entityId: term.id });
    return term;
  }

  async updateTerm(id: number, dto: UpdateTermDto, userId: number, scope: DepartmentScope = null) {
    await this.assertManagesTerms(scope);
    const current = await this.findTerm(id);
    const startsOn = dto.startsOn ?? current.startsOn.toISOString().slice(0, 10);
    const endsOn = dto.endsOn ?? current.endsOn.toISOString().slice(0, 10);
    this.assertDates(startsOn, endsOn);
    const term = await this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent)
        await tx.serviceTerm.updateMany({ where: { id: { not: id } }, data: { isCurrent: false } });
      return tx.serviceTerm.update({
        where: { id },
        data: {
          ...(dto.nameEn && { nameEn: dto.nameEn }),
          ...(dto.nameAm && { nameAm: dto.nameAm }),
          startsOn: dateOnly(startsOn),
          endsOn: dateOnly(endsOn),
          ...(dto.isCurrent !== undefined && { isCurrent: dto.isCurrent }),
        },
      });
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ServiceTerm',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return term;
  }

  async removeTerm(id: number, userId: number, scope: DepartmentScope = null): Promise<void> {
    await this.assertManagesTerms(scope);
    await this.findTerm(id);
    if (await this.prisma.serviceGroup.count({ where: { termId: id } })) {
      throw new ConflictException("Delete or move this term's groups first.");
    }
    await this.prisma.serviceTerm.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'ServiceTerm', entityId: id });
  }

  // ── Groups ───────────────────────────────────────────────────────────────

  /** A term's groups with their members (small numbers: a group is a few dozen people). */
  async listGroups(termId: number, scope: DepartmentScope = null) {
    await this.findTerm(termId);
    const groups = await this.prisma.serviceGroup.findMany({
      // Department-scoped users see the groups of classes their department runs.
      where: {
        termId,
        ...(scope !== null && { classGrade: { classType: { departmentId: { in: scope } } } }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        classGrade: { select: GRADE_SELECT },
        members: {
          where: { member: { deletedAt: null } },
          select: { member: { select: MEMBER_SUMMARY } },
        },
        _count: { select: { sessions: true } },
      },
    });
    return groups.map(({ members, _count, ...g }) => ({
      ...g,
      sessionCount: _count.sessions,
      members: members
        .map((m) => toSummary(m.member))
        .sort(
          (a, b) =>
            a.firstName.localeCompare(b.firstName) || a.fatherName.localeCompare(b.fatherName),
        ),
    }));
  }

  async createGroup(
    termId: number,
    dto: CreateGroupDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    await this.findTerm(termId);
    await this.assertGradeInScope(dto.classGradeId, scope);
    const { _max } = await this.prisma.serviceGroup.aggregate({
      where: { termId },
      _max: { sortOrder: true },
    });
    const group = await this.prisma.serviceGroup.create({
      data: { ...dto, termId, sortOrder: (_max.sortOrder ?? 0) + 1 },
    });
    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'ServiceGroup',
      entityId: group.id,
    });
    return group;
  }

  async updateGroup(
    id: number,
    dto: UpdateGroupDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    await this.findGroup(id, scope);
    if (dto.classGradeId !== undefined) await this.assertGradeInScope(dto.classGradeId, scope);
    const group = await this.prisma.serviceGroup.update({ where: { id }, data: dto });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ServiceGroup',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return group;
  }

  /** Groups that already have attendance sessions keep their history and can't be deleted. */
  async removeGroup(id: number, userId: number, scope: DepartmentScope = null): Promise<void> {
    await this.findGroup(id, scope);
    if (await this.prisma.attendanceSession.count({ where: { serviceGroupId: id } })) {
      throw new ConflictException('This group has attendance sessions, so it is kept for history.');
    }
    await this.prisma.serviceGroup.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'ServiceGroup', entityId: id });
  }

  // ── Members ──────────────────────────────────────────────────────────────

  /** Adds members to a group; anyone already in another group this term is moved. */
  async assign(
    groupId: number,
    memberIds: number[],
    userId: number,
    scope: DepartmentScope = null,
  ) {
    const group = await this.findGroup(groupId, scope);
    const ids = [...new Set(memberIds)];
    const found = await this.prisma.member.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const missing = ids.filter((id) => !found.some((m) => m.id === id));
    if (missing.length > 0) {
      throw new ValidationFailedException([
        { field: 'memberIds', messages: [`Unknown member(s): ${missing.join(', ')}`] },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceGroupMember.deleteMany({
        where: { termId: group.termId, memberId: { in: ids } },
      });
      await tx.serviceGroupMember.createMany({
        data: ids.map((memberId) => ({
          termId: group.termId,
          groupId,
          memberId,
          assignedById: userId,
        })),
      });
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ServiceGroup',
      entityId: groupId,
      changes: { added: ids },
    });
    return { assigned: ids.length };
  }

  async unassign(
    groupId: number,
    memberId: number,
    userId: number,
    scope: DepartmentScope = null,
  ): Promise<void> {
    await this.findGroup(groupId, scope);
    await this.prisma.serviceGroupMember.deleteMany({ where: { groupId, memberId } });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ServiceGroup',
      entityId: groupId,
      changes: { removed: memberId },
    });
  }

  /**
   * Spreads the active members of a class grade evenly across the chosen
   * groups (round-robin by name, filling the smallest groups first).
   */
  async distribute(
    termId: number,
    dto: DistributeDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    await this.findTerm(termId);
    await this.assertGradeInScope(dto.classGradeId, scope);
    if (scope !== null) {
      for (const id of new Set(dto.groupIds)) await this.findGroup(id, scope);
    }
    const groups = await this.prisma.serviceGroup.findMany({
      where: { termId, id: { in: dto.groupIds } },
      select: { id: true, _count: { select: { members: true } } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (groups.length !== new Set(dto.groupIds).size) {
      throw new ValidationFailedException([
        { field: 'groupIds', messages: ['Every group must belong to this term'] },
      ]);
    }
    const onlyUnassigned = dto.onlyUnassigned ?? true;
    const members = await this.prisma.member.findMany({
      where: {
        deletedAt: null,
        status: MembershipStatus.ACTIVE,
        classEnrollments: { some: { classGradeId: dto.classGradeId } },
        ...(onlyUnassigned && { serviceGroups: { none: { termId } } }),
      },
      select: { id: true },
      orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }, { id: 'asc' }],
    });
    const sizes = new Map(groups.map((g) => [g.id, onlyUnassigned ? g._count.members : 0]));
    const plan = new Map<number, number[]>(groups.map((g) => [g.id, []]));
    for (const m of members) {
      // The currently smallest group gets the next member (ties: first group).
      const [target] = [...sizes.entries()].sort((a, b) => a[1] - b[1]);
      plan.get(target![0])!.push(m.id);
      sizes.set(target![0], target![1] + 1);
    }
    await this.prisma.$transaction(async (tx) => {
      if (!onlyUnassigned) {
        await tx.serviceGroupMember.deleteMany({
          where: { termId, memberId: { in: members.map((m) => m.id) } },
        });
      }
      for (const [groupId, ids] of plan) {
        if (ids.length === 0) continue;
        await tx.serviceGroupMember.createMany({
          data: ids.map((memberId) => ({ termId, groupId, memberId, assignedById: userId })),
        });
      }
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ServiceTerm',
      entityId: termId,
      changes: { distributed: members.length },
    });
    return {
      assigned: members.length,
      groups: [...plan.entries()].map(([groupId, ids]) => ({ groupId, added: ids.length })),
    };
  }

  /** Members to pick from when assigning (filtered by class grade / search), with their group this term. */
  async candidates(termId: number, q: CandidatesQueryDto, scope: DepartmentScope = null) {
    await this.findTerm(termId);
    const terms = (q.search ?? '').split(' ').filter(Boolean).slice(0, 5);
    const rows = await this.prisma.member.findMany({
      where: {
        deletedAt: null,
        status: MembershipStatus.ACTIVE,
        ...memberScopeWhere(scope),
        ...(q.classGradeId && { classEnrollments: { some: { classGradeId: q.classGradeId } } }),
        ...(terms.length > 0 && {
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term } },
              { fatherName: { contains: term } },
              { grandfatherName: { contains: term } },
              { memberCode: { contains: term } },
            ],
          })),
        }),
      },
      select: {
        ...MEMBER_SUMMARY,
        serviceGroups: {
          where: { termId },
          select: { group: { select: { id: true, nameEn: true, nameAm: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
      take: 300,
    });
    return rows.map(({ serviceGroups, ...m }) => ({
      ...toSummary(m),
      group: serviceGroups[0]?.group ?? null,
    }));
  }

  /** A member's group in every term, newest first (the current term's is the first row). */
  async forMember(memberId: number, scope: DepartmentScope = null) {
    const rows = await this.prisma.serviceGroupMember.findMany({
      where: { memberId, member: memberScopeWhere(scope) },
      select: {
        assignedAt: true,
        term: {
          select: {
            id: true,
            nameEn: true,
            nameAm: true,
            startsOn: true,
            endsOn: true,
            isCurrent: true,
          },
        },
        group: { select: { id: true, nameEn: true, nameAm: true } },
      },
      orderBy: { term: { startsOn: 'desc' } },
    });
    return rows;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findTerm(id: number) {
    const term = await this.prisma.serviceTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException(`Service term ${id} not found`);
    return term;
  }

  /** Loads a group; department-scoped users may only touch groups of classes their department runs. */
  private async findGroup(id: number, scope: DepartmentScope = null) {
    const group = await this.prisma.serviceGroup.findUnique({
      where: { id },
      include: { classGrade: { select: { classType: { select: { departmentId: true } } } } },
    });
    if (!group) throw new NotFoundException(`Service group ${id} not found`);
    assertInScope(
      scope,
      group.classGrade?.classType.departmentId,
      'This service group belongs to another department.',
    );
    return group;
  }

  private async assertGradeInScope(gradeId: number | null | undefined, scope: DepartmentScope) {
    if (scope === null) return;
    const grade = gradeId
      ? await this.prisma.classGrade.findUnique({
          where: { id: gradeId },
          select: { classType: { select: { departmentId: true } } },
        })
      : null;
    assertInScope(
      scope,
      grade?.classType.departmentId,
      'Choose a class your department runs (e.g. Mezmur · Araray).',
    );
  }

  /** Terms are shared; besides the office, only departments that run a class may organise them. */
  private async assertManagesTerms(scope: DepartmentScope) {
    if (scope === null) return;
    if (!(await this.prisma.classType.count({ where: { departmentId: { in: scope } } }))) {
      throw new ForbiddenException(
        'Only a department that runs a class can organise service terms.',
      );
    }
  }

  private assertDates(startsOn: string, endsOn: string) {
    if (endsOn <= startsOn) {
      throw new ValidationFailedException([
        { field: 'endsOn', messages: ['endsOn must be after startsOn'] },
      ]);
    }
  }
}
