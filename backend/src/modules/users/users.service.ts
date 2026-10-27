import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { DepartmentScope } from '../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto/users.dto.js';

const OFFICE_ADMIN = 'SUPER_ADMIN';
const TAKER = 'ATTENDANCE_TAKER';
export const TEACHER = 'TEACHER';
/** The roles a department administrator may hand out. */
const DEPARTMENT_GRANTABLE = [TAKER, TEACHER];

const USER_VIEW = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  member: {
    select: {
      id: true,
      memberCode: true,
      firstName: true,
      fatherName: true,
      grandfatherName: true,
    },
  },
  roles: { select: { role: { select: { code: true, name: true, departmentScoped: true } } } },
  departments: {
    select: { department: { select: { id: true, nameEn: true, nameAm: true } } },
    orderBy: { department: { sortOrder: 'asc' } },
  },
} satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_VIEW }>;

const toView = ({ roles, departments, ...u }: UserRow) => ({
  ...u,
  role: roles[0]?.role ?? null,
  departments: departments.map((d) => d.department),
});

/**
 * Users the actor may see and change ("under" them): everyone for office
 * administrators; for department administrators, the attendance takers and
 * teachers who work only in their departments.
 */
export function manageableUsersWhere(scope: DepartmentScope): Prisma.UserWhereInput {
  if (scope === null) return {};
  return {
    roles: { some: { role: { code: { in: DEPARTMENT_GRANTABLE } } } },
    departments: { some: {}, every: { departmentId: { in: scope } } },
  };
}

/**
 * System user accounts. Office administrators manage everyone; a department
 * administrator manages only the attendance takers and teachers of their own
 * departments. A teacher's account is tied to their member record.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async list(q: QueryUsersDto, actor: AuthenticatedUser) {
    const terms = (q.search ?? '').split(' ').filter(Boolean).slice(0, 5);
    const rows = await this.prisma.user.findMany({
      where: {
        ...this.manageableWhere(actor.departmentIds),
        ...(terms.length > 0 && {
          AND: terms.map((term) => ({
            OR: [{ fullName: { contains: term } }, { email: { contains: term } }],
          })),
        }),
      },
      select: USER_VIEW,
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });
    return rows.map(toView);
  }

  /** Roles the actor may assign. */
  async roles(actor: AuthenticatedUser) {
    return this.prisma.role.findMany({
      where: actor.departmentIds === null ? {} : { code: { in: DEPARTMENT_GRANTABLE } },
      select: { code: true, name: true, description: true, departmentScoped: true },
      orderBy: { id: 'asc' },
    });
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const role = await this.resolveRole(dto.roleCode, actor.departmentIds);
    const departmentIds = await this.resolveDepartments(
      role.departmentScoped,
      dto.departmentIds,
      actor.departmentIds,
    );
    await this.assertEmailFree(dto.email);
    const memberId = await this.resolveMember(role.code, dto.memberId);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        memberId,
        email: dto.email,
        phone: dto.phone ?? null,
        passwordHash: await bcrypt.hash(dto.password, this.config.auth.bcryptRounds),
        roles: { create: { roleId: role.id } },
        departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
      },
      select: USER_VIEW,
    });
    await this.audit.record({
      userId: actor.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      changes: { role: role.code, departmentIds, memberId },
    });
    return toView(user);
  }

  /** Members who can be given a teacher login: searched across the whole register. */
  async memberCandidates(search: string) {
    const terms = search.split(' ').filter(Boolean).slice(0, 5);
    return this.prisma.member
      .findMany({
        where: {
          deletedAt: null,
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term } },
              { fatherName: { contains: term } },
              { grandfatherName: { contains: term } },
              { christianName: { contains: term } },
              { memberCode: { contains: term } },
            ],
          })),
        },
        select: {
          id: true,
          memberCode: true,
          firstName: true,
          fatherName: true,
          grandfatherName: true,
          christianName: true,
          phone: true,
          photoPath: true,
          user: { select: { id: true } },
        },
        orderBy: [{ firstName: 'asc' }, { fatherName: 'asc' }],
        take: 20,
      })
      .then((rows) =>
        rows.map(({ photoPath, user, ...m }) => ({
          ...m,
          hasPhoto: photoPath !== null,
          hasLogin: user !== null,
        })),
      );
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const target = await this.findManageable(id, actor);
    const self = id === actor.id;
    const currentRole = target.roles[0]?.role;
    const roleCode = dto.roleCode ?? currentRole?.code ?? TAKER;
    if (self && (dto.isActive === false || roleCode !== currentRole?.code)) {
      throw new ForbiddenException('You cannot deactivate yourself or change your own role.');
    }
    const role = await this.resolveRole(roleCode, actor.departmentIds);
    // Department changes are validated whenever the role or the departments change.
    const departmentIds =
      dto.departmentIds !== undefined || dto.roleCode !== undefined
        ? await this.resolveDepartments(
            role.departmentScoped,
            dto.departmentIds ?? target.departments.map((d) => d.department.id),
            actor.departmentIds,
          )
        : undefined;

    const losesOfficeAdmin =
      currentRole?.code === OFFICE_ADMIN &&
      target.isActive &&
      (role.code !== OFFICE_ADMIN || dto.isActive === false);
    if (losesOfficeAdmin) await this.assertAnotherOfficeAdmin(id);
    if (dto.email && dto.email !== target.email) await this.assertEmailFree(dto.email);
    // Teachers keep (or get) their member link; other roles drop it.
    const memberId =
      role.code === TEACHER
        ? dto.memberId !== undefined && dto.memberId !== target.member?.id
          ? await this.resolveMember(role.code, dto.memberId, id)
          : (target.member?.id ?? (await this.resolveMember(role.code, dto.memberId, id)))
        : null;

    const user = await this.prisma.$transaction(async (tx) => {
      if (role.code !== currentRole?.code) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({ data: { userId: id, roleId: role.id } });
      }
      if (departmentIds) {
        await tx.userDepartment.deleteMany({ where: { userId: id } });
        await tx.userDepartment.createMany({
          data: departmentIds.map((departmentId) => ({ userId: id, departmentId })),
        });
      }
      // Deactivating signs the user out everywhere.
      if (dto.isActive === false) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return tx.user.update({
        where: { id },
        data: {
          ...(dto.fullName && { fullName: dto.fullName }),
          ...(dto.email && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          memberId,
        },
        select: USER_VIEW,
      });
    });
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      changes: { fields: Object.keys(dto), role: role.code, departmentIds },
    });
    return toView(user);
  }

  /** Gives a user a new password and signs them out of every device. */
  async setPassword(id: number, password: string, actor: AuthenticatedUser): Promise<void> {
    await this.findManageable(id, actor);
    const passwordHash = await bcrypt.hash(password, this.config.auth.bcryptRounds);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      changes: { passwordReset: true },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private manageableWhere(scope: DepartmentScope): Prisma.UserWhereInput {
    return manageableUsersWhere(scope);
  }

  private async findManageable(id: number, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...this.manageableWhere(actor.departmentIds) },
      select: USER_VIEW,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  private async resolveRole(code: string, scope: DepartmentScope) {
    if (scope !== null && !DEPARTMENT_GRANTABLE.includes(code)) {
      throw new ForbiddenException(
        'Department administrators can only create attendance takers and teachers.',
      );
    }
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) {
      throw new ValidationFailedException([{ field: 'roleCode', messages: ['Unknown role'] }]);
    }
    return role;
  }

  /** Scoped roles need at least one department, within the actor's own; others have none. */
  private async resolveDepartments(
    departmentScoped: boolean,
    requested: number[] | undefined,
    scope: DepartmentScope,
  ): Promise<number[]> {
    if (!departmentScoped) return [];
    const ids = [...new Set(requested ?? [])];
    if (ids.length === 0) {
      throw new ValidationFailedException([
        { field: 'departmentIds', messages: ['Choose at least one department'] },
      ]);
    }
    if (scope !== null && ids.some((id) => !scope.includes(id))) {
      throw new ForbiddenException('You can only assign your own departments.');
    }
    const found = await this.prisma.department.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new ValidationFailedException([
        { field: 'departmentIds', messages: ['Unknown department'] },
      ]);
    }
    return ids;
  }

  /** Teachers must be linked to a member who has no other login; other roles have none. */
  private async resolveMember(
    roleCode: string,
    memberId: number | null | undefined,
    userId?: number,
  ): Promise<number | null> {
    if (roleCode !== TEACHER) return null;
    if (!memberId) {
      throw new ValidationFailedException([
        { field: 'memberId', messages: ['users.memberRequired'] },
      ]);
    }
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true, user: { select: { id: true } } },
    });
    if (!member) {
      throw new ValidationFailedException([{ field: 'memberId', messages: ['Unknown member'] }]);
    }
    if (member.user && member.user.id !== userId) {
      throw new ValidationFailedException([
        { field: 'memberId', messages: ['users.memberHasLogin'] },
      ]);
    }
    return member.id;
  }

  private async assertEmailFree(email: string): Promise<void> {
    if (await this.prisma.user.count({ where: { email } })) {
      throw new ConflictException({
        message: 'A user with this email already exists.',
        code: 'emailTaken',
      });
    }
  }

  /** The system must always keep at least one active office administrator. */
  private async assertAnotherOfficeAdmin(exceptId: number): Promise<void> {
    const others = await this.prisma.user.count({
      where: {
        id: { not: exceptId },
        isActive: true,
        roles: { some: { role: { code: OFFICE_ADMIN } } },
      },
    });
    if (others === 0) {
      throw new ConflictException('This is the last active office administrator.');
    }
  }
}
