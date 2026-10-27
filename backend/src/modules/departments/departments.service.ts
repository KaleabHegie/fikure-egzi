import { assertInScope, type DepartmentScope } from '../../common/auth/department-scope.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { DepartmentRole } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { dateOnly, today } from '../../common/utils/dates.js';
import { closeServicePeriods, openServicePeriod } from '../history/history.writer.js';
import type {
  AddDepartmentMemberDto,
  CreateDepartmentDto,
  CreateSubDepartmentDto,
  UpdateDepartmentDto,
  UpdateDepartmentMembershipDto,
} from './dto/department.dto.js';

/** Roles a department can have at most one of. */
const SINGLE_HOLDER_ROLES: readonly DepartmentRole[] = [DepartmentRole.HEAD, DepartmentRole.DEPUTY];

/** Sort roster by seniority, then name. */
const ROLE_RANK: Record<DepartmentRole, number> = { HEAD: 0, DEPUTY: 1, SECRETARY: 2, MEMBER: 3 };

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

type MemberSummaryRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SUMMARY }>;
const toSummary = ({ photoPath, ...m }: MemberSummaryRow) => ({
  ...m,
  hasPhoto: photoPath !== null,
});

/**
 * Departments form a tree (ፅህፈት ቤት at the top administering the rest) and
 * are admin-managed data. Members serve in departments with a role.
 */

const ROSTER_SCOPE_MESSAGE = 'You can only change the roster of your own department.';
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Flat list (clients build the tree from parentId) with counts and the current head. */
  /** Department-scoped users only see their own departments. */
  async list(includeInactive: boolean, scope: DepartmentScope = null) {
    const departments = await this.prisma.department.findMany({
      where: {
        ...(!includeInactive && { isActive: true }),
        ...(scope !== null && { id: { in: scope } }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { memberships: { where: { member: { deletedAt: null } } } } },
        memberships: {
          where: { role: DepartmentRole.HEAD, member: { deletedAt: null } },
          take: 1,
          select: { member: { select: MEMBER_SUMMARY } },
        },
      },
    });
    return departments.map(({ _count, memberships, ...d }) => ({
      ...d,
      memberCount: _count.memberships,
      head: memberships[0] ? toSummary(memberships[0].member) : null,
    }));
  }

  async findOne(id: number, scope: DepartmentScope = null) {
    assertInScope(scope, id, 'This department is not one of yours.');
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { parent: { select: { id: true, code: true, nameEn: true, nameAm: true } } },
    });
    if (!department) throw new NotFoundException(`Department ${id} not found`);
    return department;
  }

  async create(dto: CreateDepartmentDto, userId: number) {
    if (dto.parentId) await this.findOne(dto.parentId);
    const sortOrder = await this.nextOrder(dto.parentId ?? null);
    const department = await this.prisma.department.create({ data: { ...dto, sortOrder } });
    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'Department',
      entityId: department.id,
    });
    return department;
  }

  /** Creates a child department and appoints a member of its parent as head. */
  async createSubDepartment(
    parentId: number,
    dto: CreateSubDepartmentDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    assertInScope(scope, parentId, ROSTER_SCOPE_MESSAGE);
    const parent = await this.findOne(parentId);
    if (!parent.isActive) throw new ConflictException('An inactive department cannot create sub-departments.');
    const isParentMember = await this.prisma.departmentMembership.count({
      where: { departmentId: parentId, memberId: dto.headMemberId, member: { deletedAt: null } },
    });
    if (!isParentMember) {
      throw new ValidationFailedException([
        { field: 'headMemberId', messages: ['Choose a current member of this department.'] },
      ]);
    }
    const { headMemberId, ...departmentData } = dto;
    const sortOrder = await this.nextOrder(parentId);
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: { ...departmentData, parentId, sortOrder },
      });
      const membership = await tx.departmentMembership.create({
        data: {
          departmentId: department.id,
          memberId: headMemberId,
          role: DepartmentRole.HEAD,
          joinedAt: today(),
          createdById: userId,
        },
      });
      await openServicePeriod(tx, { memberId: headMemberId, departmentId: department.id, role: DepartmentRole.HEAD }, today(), userId);
      await this.audit.record(
        { userId, action: 'CREATE', entity: 'Department', entityId: department.id, changes: { parentId, headMemberId, membershipId: membership.id } },
        tx,
      );
      return department;
    });
  }

  async update(id: number, dto: UpdateDepartmentDto, userId: number) {
    const current = await this.findOne(id);
    const data: Prisma.DepartmentUncheckedUpdateInput = { ...dto };
    if (dto.parentId !== undefined && dto.parentId !== current.parentId) {
      await this.assertValidParent(id, dto.parentId);
      data.sortOrder = await this.nextOrder(dto.parentId);
    }
    const department = await this.prisma.department.update({ where: { id }, data });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'Department',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return department;
  }

  /** Only departments with no sub-departments and nobody serving can be deleted. */
  async remove(id: number, userId: number): Promise<void> {
    await this.findOne(id);
    if (await this.prisma.asset.count({ where: { departmentId: id } })) {
      throw new ConflictException(
        'This department is responsible for assets. Give them to another department first.',
      );
    }
    if (await this.prisma.classType.count({ where: { departmentId: id } })) {
      throw new ConflictException(
        'This department runs classes. Give those classes another department first.',
      );
    }
    const [children, members] = await Promise.all([
      this.prisma.department.count({ where: { parentId: id } }),
      this.prisma.departmentMembership.count({ where: { departmentId: id } }),
    ]);
    if (children > 0 || members > 0) {
      throw new ConflictException(
        'This department still has sub-departments or members. Move or remove them first, or deactivate it instead.',
      );
    }
    if (await this.prisma.departmentServiceHistory.count({ where: { departmentId: id } })) {
      throw new ConflictException(
        'Members have served in this department before; deleting it would erase their history. Deactivate it instead.',
      );
    }
    await this.prisma.department.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'Department', entityId: id });
  }

  async reorder(parentId: number | null, ids: number[], userId: number): Promise<void> {
    const siblings = await this.prisma.department.findMany({
      where: { parentId },
      select: { id: true },
    });
    const expected = siblings.map((s) => s.id).sort((a, b) => a - b);
    const given = [...new Set(ids)].sort((a, b) => a - b);
    if (given.length !== ids.length || given.join() !== expected.join()) {
      throw new ValidationFailedException([
        {
          field: 'ids',
          messages: ['ids must list every department under that parent exactly once'],
        },
      ]);
    }
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.department.update({ where: { id }, data: { sortOrder: i + 1 } }),
      ),
    );
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'Department',
      changes: { reordered: ids },
    });
  }

  // ── Members serving in a department ──────────────────────────────────────

  async listMembers(departmentId: number, scope: DepartmentScope = null) {
    await this.findOne(departmentId, scope);
    const rows = await this.prisma.departmentMembership.findMany({
      where: { departmentId, member: { deletedAt: null } },
      select: { id: true, role: true, joinedAt: true, member: { select: MEMBER_SUMMARY } },
    });
    return rows
      .map((r) => ({ ...r, member: toSummary(r.member) }))
      .sort(
        (a, b) =>
          ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
          a.member.firstName.localeCompare(b.member.firstName),
      );
  }

  async addMember(
    departmentId: number,
    dto: AddDepartmentMemberDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    assertInScope(scope, departmentId, ROSTER_SCOPE_MESSAGE);
    const department = await this.findOne(departmentId);
    if (!department.isActive) {
      throw new ConflictException(
        'This department is inactive. Activate it before adding members.',
      );
    }
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, deletedAt: null },
    });
    if (!member) {
      throw new ValidationFailedException([{ field: 'memberId', messages: ['Member not found'] }]);
    }
    const role = dto.role ?? DepartmentRole.MEMBER;
    await this.assertRoleFree(departmentId, role);
    const joinedAt = dto.joinedAt ? dateOnly(dto.joinedAt) : today();
    try {
      const membership = await this.prisma.$transaction(async (tx) => {
        const created = await tx.departmentMembership.create({
          data: { departmentId, memberId: dto.memberId, role, joinedAt, createdById: userId },
        });
        await openServicePeriod(
          tx,
          { memberId: dto.memberId, departmentId, role },
          joinedAt,
          userId,
        );
        await this.audit.record(
          {
            userId,
            action: 'CREATE',
            entity: 'DepartmentMembership',
            entityId: created.id,
            changes: { departmentId, memberId: dto.memberId, role },
          },
          tx,
        );
        return created;
      });
      return membership;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This member already serves in this department.');
      }
      throw err;
    }
  }

  /**
   * A role change ends the current service period and starts a new one, so
   * "Member since X, Head since Y" stays visible. Correcting the start date
   * edits the open period instead.
   */
  async updateMembership(
    id: number,
    dto: UpdateDepartmentMembershipDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    const membership = await this.findMembership(id);
    assertInScope(scope, membership.departmentId, ROSTER_SCOPE_MESSAGE);
    const roleChanged = Boolean(dto.role && dto.role !== membership.role);
    if (roleChanged) await this.assertRoleFree(membership.departmentId, dto.role!);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.departmentMembership.update({
        where: { id },
        data: {
          ...(dto.role && { role: dto.role }),
          ...(dto.joinedAt && { joinedAt: dateOnly(dto.joinedAt) }),
        },
      });
      const { memberId, departmentId } = membership;
      if (roleChanged) {
        const changedOn = today();
        await closeServicePeriods(tx, memberId, changedOn, departmentId);
        await openServicePeriod(tx, { memberId, departmentId, role: dto.role! }, changedOn, userId);
      } else if (dto.joinedAt) {
        await tx.departmentServiceHistory.updateMany({
          where: { memberId, departmentId, endedAt: null },
          data: { startedAt: dateOnly(dto.joinedAt) },
        });
      }
      await this.audit.record(
        {
          userId,
          action: 'UPDATE',
          entity: 'DepartmentMembership',
          entityId: id,
          changes: {
            fields: Object.keys(dto),
            ...(roleChanged && { from: membership.role, to: dto.role }),
          },
        },
        tx,
      );
      return updated;
    });
  }

  async removeMembership(id: number, userId: number, scope: DepartmentScope = null): Promise<void> {
    const membership = await this.findMembership(id);
    assertInScope(scope, membership.departmentId, ROSTER_SCOPE_MESSAGE);
    await this.prisma.$transaction(async (tx) => {
      await tx.departmentMembership.delete({ where: { id } });
      await closeServicePeriods(tx, membership.memberId, today(), membership.departmentId);
      await this.audit.record(
        { userId, action: 'DELETE', entity: 'DepartmentMembership', entityId: id },
        tx,
      );
    });
  }

  /** Past (ended) service periods in this department, most recently ended first. */
  async history(departmentId: number, scope: DepartmentScope = null) {
    await this.findOne(departmentId, scope);
    const rows = await this.prisma.departmentServiceHistory.findMany({
      where: { departmentId, endedAt: { not: null }, member: { deletedAt: null } },
      orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        role: true,
        startedAt: true,
        endedAt: true,
        member: { select: MEMBER_SUMMARY },
      },
    });
    return rows.map((r) => ({ ...r, member: toSummary(r.member) }));
  }

  /** Members matching `search` (name or ID), for adding to a roster — not limited to the user's members. */
  async candidates(departmentId: number, search: string, scope: DepartmentScope = null) {
    await this.findOne(departmentId, scope);
    const terms = search.trim().split(/\s+/).filter(Boolean).slice(0, 5);
    const rows = await this.prisma.member.findMany({
      where: {
        deletedAt: null,
        ...(terms.length > 0 && {
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term } },
              { fatherName: { contains: term } },
              { grandfatherName: { contains: term } },
              { christianName: { contains: term } },
              { memberCode: { contains: term } },
            ],
          })),
        }),
      },
      select: MEMBER_SUMMARY,
      orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
      take: 8,
    });
    return rows.map(toSummary);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findMembership(id: number) {
    const membership = await this.prisma.departmentMembership.findUnique({ where: { id } });
    if (!membership) throw new NotFoundException(`Department membership ${id} not found`);
    return membership;
  }

  private async assertRoleFree(departmentId: number, role: DepartmentRole): Promise<void> {
    if (!SINGLE_HOLDER_ROLES.includes(role)) return;
    const holder = await this.prisma.departmentMembership.findFirst({
      where: { departmentId, role, member: { deletedAt: null } },
    });
    if (holder) {
      throw new ConflictException(
        `This department already has a ${role === DepartmentRole.HEAD ? 'head' : 'deputy'}. Change their role first.`,
      );
    }
  }

  /** A department cannot be its own ancestor. */
  private async assertValidParent(id: number, parentId: number | null): Promise<void> {
    let cursor = parentId;
    while (cursor !== null) {
      if (cursor === id) {
        throw new ValidationFailedException([
          {
            field: 'parentId',
            messages: ['A department cannot be placed under itself or its own sub-department'],
          },
        ]);
      }
      const parent = await this.prisma.department.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!parent) {
        throw new ValidationFailedException([
          { field: 'parentId', messages: ['Parent department not found'] },
        ]);
      }
      cursor = parent.parentId;
    }
  }

  private async nextOrder(parentId: number | null): Promise<number> {
    const { _max } = await this.prisma.department.aggregate({
      where: { parentId },
      _max: { sortOrder: true },
    });
    return (_max.sortOrder ?? 0) + 1;
  }
}
