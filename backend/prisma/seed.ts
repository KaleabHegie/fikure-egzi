/**
 * Idempotent seed: syncs the permission catalog and system roles from code,
 * and creates the first super admin if no user with that email exists.
 * Safe to re-run after every deploy that adds permissions.
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_DEFINITIONS, SYSTEM_ROLES } from '../src/common/auth/permissions.js';
import { DEFAULT_CLASS_TYPES } from '../src/modules/classes/default-classes.js';
import {
  DEFAULT_DEPARTMENTS,
  OFFICE_DEPARTMENT,
} from '../src/modules/departments/default-departments.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { buildMariaDbPoolConfig } from '../src/prisma/database-url.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(buildMariaDbPoolConfig(databaseUrl, 2)),
});

async function syncPermissions(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const def of PERMISSION_DEFINITIONS) {
    const p = await prisma.permission.upsert({
      where: { code: def.code },
      update: { module: def.module, description: def.description },
      create: def,
    });
    ids.set(p.code, p.id);
  }
  return ids;
}

function requirePermissionId(ids: Map<string, number>, code: string): number {
  const id = ids.get(code);
  if (id === undefined)
    throw new Error(`Role grants "${code}", which is not in PERMISSION_DEFINITIONS`);
  return id;
}

async function syncRoles(permissionIds: Map<string, number>): Promise<void> {
  for (const def of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description,
        isSystem: true,
        departmentScoped: def.departmentScoped,
      },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
        departmentScoped: def.departmentScoped,
      },
    });
    // System roles are owned by code: replace their grants wholesale.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: def.permissions.map((code) => ({
          roleId: role.id,
          permissionId: requirePermissionId(permissionIds, code),
        })),
      }),
    ]);
  }
}

/** System roles dropped from code are deleted, unless someone still holds them. */
async function removeRetiredRoles(): Promise<void> {
  const codes = SYSTEM_ROLES.map((r) => r.code);
  const retired = await prisma.role.findMany({
    where: { isSystem: true, code: { notIn: codes } },
    include: { _count: { select: { users: true } } },
  });
  for (const role of retired) {
    if (role._count.users > 0) {
      console.warn(
        `Role ${role.code} is retired but still held by ${role._count.users} user(s) — kept`,
      );
      continue;
    }
    await prisma.role.delete({ where: { id: role.id } });
    console.log(`Removed retired role ${role.code}`);
  }
}

async function ensureSuperAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user');
    return;
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`Admin ${email} already exists — leaving it unchanged`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: 'SUPER_ADMIN' },
  });
  await prisma.user.create({
    data: {
      email,
      fullName: process.env.SEED_ADMIN_NAME ?? 'System Administrator',
      passwordHash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12)),
      roles: { create: { roleId: role.id } },
    },
  });
  console.log(`Created super admin ${email}`);
}

/** Creates missing default class types; existing ones are left as the admins configured them. */
async function ensureDefaultClasses(): Promise<void> {
  for (const [typeIndex, def] of DEFAULT_CLASS_TYPES.entries()) {
    if (await prisma.classType.findUnique({ where: { code: def.code } })) continue;
    await prisma.classType.create({
      data: {
        code: def.code,
        nameEn: def.nameEn,
        nameAm: def.nameAm,
        descriptionEn: def.descriptionEn,
        descriptionAm: def.descriptionAm,
        sortOrder: typeIndex + 1,
        department: { connect: { code: def.departmentCode } },
        grades: { create: def.grades.map((g, i) => ({ ...g, sortOrder: i + 1 })) },
      },
    });
    console.log(`Created class type ${def.code} with ${def.grades.length} grades`);
  }
}

/** Creates the office and its departments when missing; existing ones are left as configured. */
async function ensureDefaultDepartments(): Promise<void> {
  const office =
    (await prisma.department.findUnique({ where: { code: OFFICE_DEPARTMENT.code } })) ??
    (await prisma.department.create({ data: { ...OFFICE_DEPARTMENT, sortOrder: 1 } }));
  let created = 0;
  for (const [i, def] of DEFAULT_DEPARTMENTS.entries()) {
    if (await prisma.department.findUnique({ where: { code: def.code } })) continue;
    await prisma.department.create({ data: { ...def, parentId: office.id, sortOrder: i + 1 } });
    created += 1;
  }
  if (created > 0) console.log(`Created ${created} departments under ${OFFICE_DEPARTMENT.nameAm}`);
}

async function main(): Promise<void> {
  const permissionIds = await syncPermissions();
  await syncRoles(permissionIds);
  await removeRetiredRoles();
  // Departments first: default classes are linked to the department that runs them.
  await ensureDefaultDepartments();
  await ensureDefaultClasses();
  await ensureSuperAdmin();
  console.log(`Synced ${permissionIds.size} permissions and ${SYSTEM_ROLES.length} system roles`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
