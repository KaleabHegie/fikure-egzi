import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { assertInScope, type DepartmentScope } from '../../common/auth/department-scope.js';
import { ValidationFailedException } from '../../common/filters/all-exceptions.filter.js';
import { Paginated } from '../../common/pagination/paginated.js';
import { dateOnly } from '../../common/utils/dates.js';
import { detectImageType, MIME_BY_EXT } from '../../common/utils/image-type.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AssetStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FileStorageService } from '../storage/file-storage.service.js';
import type { CreateAssetDto, QueryAssetsDto, UpdateAssetDto } from './dto/asset.dto.js';

export const MAX_ASSET_PHOTO_BYTES = 3 * 1024 * 1024;
const ENTITY = 'Asset';
const SCOPE_MESSAGE = 'This asset belongs to a department you are not assigned to.';

const ASSET_SELECT = {
  id: true,
  assetCode: true,
  name: true,
  category: true,
  description: true,
  quantity: true,
  condition: true,
  status: true,
  location: true,
  serialNumber: true,
  acquisition: true,
  acquiredOn: true,
  cost: true,
  donorName: true,
  departmentId: true,
  notes: true,
  photoPath: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, nameEn: true, nameAm: true } },
} satisfies Prisma.AssetSelect;
type AssetRow = Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>;

/** API shape: money as a number, photo as a flag (bytes are streamed separately). */
const toAsset = ({ photoPath, cost, ...a }: AssetRow) => ({
  ...a,
  cost: cost === null ? null : Number(cost),
  hasPhoto: photoPath !== null,
});

/** Adds the asset totals to a page's meta (the list keeps the usual { data, meta } shape). */
function withTotals<T>(
  page: Paginated<T>,
  totals: { assets: number; items: number; value: number },
) {
  const meta = { ...page.meta, totals };
  return new Paginated(page.items, meta);
}

export const formatAssetCode = (id: number) => `AS-${String(id).padStart(5, '0')}`;

/**
 * The Sunday school's property. Each asset is the responsibility of one
 * department; department admins see and manage only their departments' assets.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: FileStorageService,
  ) {}

  async list(q: QueryAssetsDto, scope: DepartmentScope) {
    const terms = (q.search ?? '').split(' ').filter(Boolean).slice(0, 5);
    const where: Prisma.AssetWhereInput = {
      ...(scope !== null && { departmentId: { in: scope } }),
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.category && { category: q.category }),
      ...(q.status && { status: q.status }),
      ...(q.condition && { condition: q.condition }),
      ...(terms.length > 0 && {
        AND: terms.map((term) => ({
          OR: [
            { name: { contains: term } },
            { assetCode: { contains: term } },
            { serialNumber: { contains: term } },
            { location: { contains: term } },
          ],
        })),
      }),
    };
    // A department filter can't widen a department admin's view.
    if (scope !== null && q.departmentId && !scope.includes(q.departmentId)) {
      return withTotals(Paginated.of([], 0, q.page, q.pageSize), { assets: 0, items: 0, value: 0 });
    }
    const [total, rows, sums] = await this.prisma.$transaction([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        select: ASSET_SELECT,
        orderBy: [{ assetCode: q.sortOrder }],
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.asset.aggregate({
        where: { ...where, status: { not: AssetStatus.DISPOSED } },
        _sum: { quantity: true, cost: true },
        _count: { _all: true },
      }),
    ]);
    // Totals for what's still owned (disposed assets are left out), next to the paging info.
    return withTotals(Paginated.of(rows.map(toAsset), total, q.page, q.pageSize), {
      assets: sums._count._all,
      items: sums._sum.quantity ?? 0,
      value: Number(sums._sum.cost ?? 0),
    });
  }

  async findOne(id: number, scope: DepartmentScope) {
    return toAsset(await this.findRow(id, scope));
  }

  async create(dto: CreateAssetDto, userId: number, scope: DepartmentScope) {
    assertInScope(scope, dto.departmentId, 'You can only register assets for your own department.');
    await this.assertDepartment(dto.departmentId);
    const asset = await this.prisma.$transaction(async (tx) => {
      // The code comes from the id: insert with a placeholder, then stamp it.
      const created = await tx.asset.create({
        data: {
          ...dto,
          acquiredOn: dto.acquiredOn ? dateOnly(dto.acquiredOn) : null,
          assetCode: `TMP-${randomUUID().slice(0, 12)}`,
          createdById: userId,
          updatedById: userId,
        },
        select: { id: true },
      });
      const row = await tx.asset.update({
        where: { id: created.id },
        data: { assetCode: formatAssetCode(created.id) },
        select: ASSET_SELECT,
      });
      await this.audit.record({ userId, action: 'CREATE', entity: ENTITY, entityId: row.id }, tx);
      return row;
    });
    return toAsset(asset);
  }

  async update(id: number, dto: UpdateAssetDto, userId: number, scope: DepartmentScope) {
    await this.findRow(id, scope);
    if (dto.departmentId !== undefined) {
      assertInScope(scope, dto.departmentId, 'You can only hand assets to your own departments.');
      await this.assertDepartment(dto.departmentId);
    }
    const { acquiredOn, ...rest } = dto;
    const row = await this.prisma.asset.update({
      where: { id },
      data: {
        ...rest,
        ...(acquiredOn !== undefined && { acquiredOn: acquiredOn ? dateOnly(acquiredOn) : null }),
        updatedById: userId,
      },
      select: ASSET_SELECT,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return toAsset(row);
  }

  async remove(id: number, userId: number, scope: DepartmentScope): Promise<void> {
    const { photoPath } = await this.findRow(id, scope);
    await this.prisma.asset.delete({ where: { id } });
    if (photoPath) await this.storage.remove(photoPath).catch(() => undefined);
    await this.audit.record({ userId, action: 'DELETE', entity: ENTITY, entityId: id });
  }

  // ── Photo ────────────────────────────────────────────────────────────────

  async setPhoto(
    id: number,
    file: { buffer: Buffer; size: number } | undefined,
    userId: number,
    scope: DepartmentScope,
  ) {
    if (!file || file.size === 0) {
      throw new ValidationFailedException([
        { field: 'photo', messages: ['A photo file is required'] },
      ]);
    }
    if (file.size > MAX_ASSET_PHOTO_BYTES) {
      throw new ValidationFailedException([
        { field: 'photo', messages: ['Photo must be 3 MB or smaller'] },
      ]);
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new ValidationFailedException([
        { field: 'photo', messages: ['Photo must be a JPEG, PNG or WebP image'] },
      ]);
    }
    const previous = (await this.findRow(id, scope)).photoPath;
    const key = `assets/${id}-${randomUUID().slice(0, 8)}.${type.ext}`;
    await this.storage.save(key, file.buffer);
    try {
      const row = await this.prisma.asset.update({
        where: { id },
        data: { photoPath: key, updatedById: userId },
        select: ASSET_SELECT,
      });
      await this.audit.record({
        userId,
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        changes: { fields: ['photo'] },
      });
      if (previous) await this.storage.remove(previous).catch(() => undefined);
      return toAsset(row);
    } catch (e) {
      await this.storage.remove(key).catch(() => undefined);
      throw e;
    }
  }

  async removePhoto(id: number, userId: number, scope: DepartmentScope) {
    const { photoPath } = await this.findRow(id, scope);
    const row = await this.prisma.asset.update({
      where: { id },
      data: { photoPath: null, updatedById: userId },
      select: ASSET_SELECT,
    });
    if (photoPath) await this.storage.remove(photoPath).catch(() => undefined);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      changes: { fields: ['photo'], removed: true },
    });
    return toAsset(row);
  }

  async openPhoto(id: number, scope: DepartmentScope) {
    const { photoPath } = await this.findRow(id, scope);
    if (!photoPath) throw new NotFoundException('This asset has no photo');
    const ext = photoPath.slice(photoPath.lastIndexOf('.') + 1);
    return {
      ...(await this.storage.open(photoPath)),
      mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findRow(id: number, scope: DepartmentScope): Promise<AssetRow> {
    const row = await this.prisma.asset.findUnique({ where: { id }, select: ASSET_SELECT });
    if (!row) throw new NotFoundException(`Asset ${id} not found`);
    assertInScope(scope, row.departmentId, SCOPE_MESSAGE);
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
