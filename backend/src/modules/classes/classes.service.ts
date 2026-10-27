import { assertInScope, type DepartmentScope } from '../../common/auth/department-scope.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateClassGradeDto,
  CreateClassTypeDto,
  UpdateClassGradeDto,
  UpdateClassTypeDto,
} from './dto/class-type.dto.js';

const GRADE_SELECT = {
  id: true,
  classTypeId: true,
  code: true,
  nameEn: true,
  nameAm: true,
  shortLabel: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.ClassGradeSelect;

/**
 * Class types (Mezmur, Course, …) and their ordered grades. Everything here
 * is admin-managed data; nothing about specific classes is hard-coded.
 */

const OWN_DEPARTMENT_MESSAGE = 'You can only change the classes your department runs.';
@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * All types with their grades (ordered) and how many members sit in each
   * grade. Department-scoped users only see the classes their department runs.
   */
  async list(includeInactive: boolean, scope: DepartmentScope = null) {
    const active = includeInactive ? {} : { isActive: true };
    const [types, counts] = await Promise.all([
      this.prisma.classType.findMany({
        where: { ...active, ...(scope !== null && { departmentId: { in: scope } }) },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          department: { select: { id: true, nameEn: true, nameAm: true } },
          grades: {
            where: active,
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: GRADE_SELECT,
          },
        },
      }),
      this.prisma.memberClassEnrollment.groupBy({
        by: ['classGradeId'],
        where: { member: { deletedAt: null } },
        _count: { _all: true },
      }),
    ]);
    const countByGrade = new Map(counts.map((c) => [c.classGradeId, c._count._all]));
    return types.map((type) => {
      const grades = type.grades.map((g) => ({ ...g, memberCount: countByGrade.get(g.id) ?? 0 }));
      return { ...type, grades, memberCount: grades.reduce((sum, g) => sum + g.memberCount, 0) };
    });
  }

  // ── Types ────────────────────────────────────────────────────────────────

  async createType(dto: CreateClassTypeDto, userId: number, scope: DepartmentScope = null) {
    assertInScope(scope, dto.departmentId, OWN_DEPARTMENT_MESSAGE);
    await this.assertDepartment(dto.departmentId);
    const sortOrder = dto.sortOrder ?? (await this.nextTypeOrder());
    const type = await this.prisma.classType.create({ data: { ...dto, sortOrder } });
    await this.audit.record({ userId, action: 'CREATE', entity: 'ClassType', entityId: type.id });
    return type;
  }

  async updateType(
    id: number,
    dto: UpdateClassTypeDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    await this.findType(id, scope);
    if (dto.departmentId !== undefined)
      assertInScope(scope, dto.departmentId, OWN_DEPARTMENT_MESSAGE);
    await this.assertDepartment(dto.departmentId);
    const type = await this.prisma.classType.update({ where: { id }, data: dto });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ClassType',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return type;
  }

  /** Only empty types can be deleted; otherwise deactivate them to keep history. */
  async removeType(id: number, userId: number, scope: DepartmentScope = null): Promise<void> {
    await this.findType(id, scope);
    const [grades, enrollments] = await Promise.all([
      this.prisma.classGrade.count({ where: { classTypeId: id } }),
      this.prisma.memberClassEnrollment.count({ where: { classTypeId: id } }),
    ]);
    if (grades > 0 || enrollments > 0) {
      throw new ConflictException(
        'This class type still has grades or members. Remove its grades first, or deactivate it instead.',
      );
    }
    await this.prisma.classType.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'ClassType', entityId: id });
  }

  /**
   * A department admin reorders only their own class types: they take the
   * same positions (sort-order slots) among all types, in the new order.
   */
  async reorderTypes(ids: number[], userId: number, scope: DepartmentScope = null): Promise<void> {
    const existing = await this.prisma.classType.findMany({
      where: scope === null ? {} : { departmentId: { in: scope } },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    this.assertSameSet(
      ids,
      existing.map((t) => t.id),
    );
    const slots = scope === null ? ids.map((_, i) => i + 1) : existing.map((t) => t.sortOrder);
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.classType.update({ where: { id }, data: { sortOrder: slots[i]! } }),
      ),
    );
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ClassType',
      changes: { reordered: ids },
    });
  }

  // ── Grades ───────────────────────────────────────────────────────────────

  async createGrade(
    classTypeId: number,
    dto: CreateClassGradeDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    await this.findType(classTypeId, scope);
    const sortOrder = dto.sortOrder ?? (await this.nextGradeOrder(classTypeId));
    const grade = await this.prisma.classGrade.create({
      data: { ...dto, classTypeId, sortOrder },
      select: GRADE_SELECT,
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'ClassGrade', entityId: grade.id });
    return grade;
  }

  async updateGrade(
    id: number,
    dto: UpdateClassGradeDto,
    userId: number,
    scope: DepartmentScope = null,
  ) {
    await this.findGrade(id, scope);
    const grade = await this.prisma.classGrade.update({
      where: { id },
      data: dto,
      select: GRADE_SELECT,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ClassGrade',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return grade;
  }

  /** Only grades without members can be deleted; otherwise deactivate them. */
  async removeGrade(id: number, userId: number, scope: DepartmentScope = null): Promise<void> {
    await this.findGrade(id, scope);
    const enrollments = await this.prisma.memberClassEnrollment.count({
      where: { classGradeId: id },
    });
    if (enrollments > 0) {
      throw new ConflictException(
        `${enrollments} member(s) are in this grade. Move them to another grade, or deactivate it instead.`,
      );
    }
    if (await this.prisma.classPlacementHistory.count({ where: { classGradeId: id } })) {
      throw new ConflictException(
        'Members have been in this grade before; deleting it would erase their history. Deactivate it instead.',
      );
    }
    await this.prisma.classGrade.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'ClassGrade', entityId: id });
  }

  async reorderGrades(
    classTypeId: number,
    ids: number[],
    userId: number,
    scope: DepartmentScope = null,
  ): Promise<void> {
    await this.findType(classTypeId, scope);
    const existing = await this.prisma.classGrade.findMany({
      where: { classTypeId },
      select: { id: true },
    });
    this.assertSameSet(
      ids,
      existing.map((g) => g.id),
    );
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.classGrade.update({ where: { id }, data: { sortOrder: i + 1 } }),
      ),
    );
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'ClassType',
      entityId: classTypeId,
      changes: { reorderedGrades: ids },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Department admins may only change the classes their department runs. */
  private async findType(id: number, scope: DepartmentScope = null) {
    const type = await this.prisma.classType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException(`Class type ${id} not found`);
    assertInScope(scope, type.departmentId, OWN_DEPARTMENT_MESSAGE);
    return type;
  }

  private async findGrade(id: number, scope: DepartmentScope = null) {
    const grade = await this.prisma.classGrade.findUnique({
      where: { id },
      include: { classType: { select: { departmentId: true } } },
    });
    if (!grade) throw new NotFoundException(`Class grade ${id} not found`);
    assertInScope(scope, grade.classType.departmentId, OWN_DEPARTMENT_MESSAGE);
    return grade;
  }

  private async nextTypeOrder(): Promise<number> {
    const { _max } = await this.prisma.classType.aggregate({ _max: { sortOrder: true } });
    return (_max.sortOrder ?? 0) + 1;
  }

  private async nextGradeOrder(classTypeId: number): Promise<number> {
    const { _max } = await this.prisma.classGrade.aggregate({
      where: { classTypeId },
      _max: { sortOrder: true },
    });
    return (_max.sortOrder ?? 0) + 1;
  }

  private assertSameSet(given: number[], existing: number[]): void {
    const a = [...new Set(given)].sort((x, y) => x - y);
    const b = [...existing].sort((x, y) => x - y);
    if (a.length !== given.length || a.length !== b.length || a.some((v, i) => v !== b[i])) {
      throw new ValidationFailedException([
        { field: 'ids', messages: ['ids must list every item exactly once'] },
      ]);
    }
  }

  private async assertDepartment(departmentId: number | undefined): Promise<void> {
    if (
      departmentId !== undefined &&
      !(await this.prisma.department.count({ where: { id: departmentId } }))
    ) {
      throw new ValidationFailedException([
        { field: 'departmentId', messages: ['Unknown department'] },
      ]);
    }
  }
}
