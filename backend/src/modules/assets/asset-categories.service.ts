import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { DepartmentScope } from '../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateAssetCategoryDto, UpdateAssetCategoryDto } from './dto/asset-category.dto.js';

const ENTITY = 'AssetCategory';
const SELECT = { id: true, code: true, nameEn: true, nameAm: true, sortOrder: true } as const;

/**
 * Admin-managed asset categories. Reading follows assets.read; changing them
 * is office-only, because categories are shared by every department.
 */
@Injectable()
export class AssetCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.assetCategory.findMany({
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async create(dto: CreateAssetCategoryDto, userId: number, scope: DepartmentScope) {
    this.assertOffice(scope);
    const last = await this.prisma.assetCategory.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.assetCategory.create({
      data: { ...dto, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: SELECT,
    });
    await this.audit.record({ userId, action: 'CREATE', entity: ENTITY, entityId: row.id });
    return row;
  }

  async update(id: number, dto: UpdateAssetCategoryDto, userId: number, scope: DepartmentScope) {
    this.assertOffice(scope);
    await this.findRow(id);
    const row = await this.prisma.assetCategory.update({ where: { id }, data: dto, select: SELECT });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return row;
  }

  async remove(id: number, userId: number, scope: DepartmentScope): Promise<void> {
    this.assertOffice(scope);
    await this.findRow(id);
    const inUse = await this.prisma.asset.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new ValidationFailedException([
        { field: 'id', messages: [`${inUse} assets use this category; move them first`] },
      ]);
    }
    await this.prisma.assetCategory.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: ENTITY, entityId: id });
  }

  private assertOffice(scope: DepartmentScope) {
    if (scope !== null) {
      throw new ForbiddenException('Only office administrators can change asset categories.');
    }
  }

  private async findRow(id: number) {
    const row = await this.prisma.assetCategory.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException(`Asset category ${id} not found`);
    return row;
  }
}
