/**
 * DEV ONLY: inserts realistic demo members so the UI and queries can be
 * exercised at the target scale (~2,000 members).
 *   npm run db:seed:demo            # 2000 members
 *   npm run db:seed:demo -- 500     # custom count
 *   npm run db:seed:demo -- 0       # only place existing unplaced members into classes
 * Also creates demo Mezmur-department accounts (an admin and an attendance
 * taker) when DEMO_USER_PASSWORD is set in .env.
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { buildMariaDbPoolConfig } from '../src/prisma/database-url.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to load demo data into a production database');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(buildMariaDbPoolConfig(databaseUrl, 2)),
});

const MALE = [
  'Abebe',
  'Dawit',
  'Yonas',
  'Kidus',
  'Bereket',
  'Henok',
  'Samuel',
  'Tewodros',
  'Mikias',
  'Natnael',
  'Eyob',
  'Yared',
  'Biniyam',
  'Fitsum',
  'Robel',
];
const FEMALE = [
  'Hanna',
  'Selam',
  'Meron',
  'Tigist',
  'Bethlehem',
  'Mahlet',
  'Ruth',
  'Saron',
  'Helen',
  'Kalkidan',
  'Liya',
  'Eden',
  'Rahel',
  'Tsion',
  'Yordanos',
];
const FATHERS = [
  'Kebede',
  'Tesfaye',
  'Alemu',
  'Girma',
  'Bekele',
  'Haile',
  'Wolde',
  'Desta',
  'Mengistu',
  'Tadesse',
  'Assefa',
  'Gebre',
  'Mulugeta',
  'Shiferaw',
  'Negash',
];
const CHRISTIAN = [
  'Wolde Mariam',
  'Gebre Mikael',
  'Haile Selassie',
  'Wolde Giorgis',
  'Kidane Mariam',
  'Ehite Mariam',
  'Amete Selassie',
  'Welete Gabriel',
];
const SUB_CITIES = [
  'Bole',
  'Yeka',
  'Kirkos',
  'Arada',
  'Lideta',
  'Gulele',
  'Kolfe Keranio',
  'Nifas Silk-Lafto',
  'Akaki Kality',
  'Addis Ketema',
];
const FATHERS_CONFESSOR = ['Aba Gebre Mariam', 'Aba Wolde Tensae', 'Kesis Haile', 'Kesis Tekle'];

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const pad = (n: number) => String(n).padStart(2, '0');
const date = (y: number, m: number, d: number) =>
  new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00.000Z`);

function demoMember(): Prisma.MemberCreateManyInput {
  const gender = rand() < 0.5 ? 'MALE' : 'FEMALE';
  const age = Math.floor(rand() * 50) + 5;
  const birthYear = new Date().getFullYear() - age;
  const r = rand();
  return {
    memberCode: `TMP-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    firstName: pick(gender === 'MALE' ? MALE : FEMALE),
    fatherName: pick(FATHERS),
    grandfatherName: pick(FATHERS),
    christianName: rand() < 0.7 ? pick(CHRISTIAN) : null,
    gender,
    dateOfBirth: date(birthYear, Math.ceil(rand() * 12), Math.ceil(rand() * 28)),
    phone: rand() < 0.85 ? `09${String(Math.floor(rand() * 1e8)).padStart(8, '0')}` : null,
    city: 'Addis Ababa',
    subCity: pick(SUB_CITIES),
    woreda: pad(Math.ceil(rand() * 14)),
    spiritualFatherName: rand() < 0.5 ? pick(FATHERS_CONFESSOR) : null,
    status: r < 0.85 ? 'ACTIVE' : 'INACTIVE',
    joinedAt: date(
      Math.max(birthYear + 4, 2010) + Math.floor(rand() * 5),
      Math.ceil(rand() * 12),
      Math.ceil(rand() * 28),
    ),
    emergencyContactName: age < 13 ? `${pick(FEMALE)} ${pick(FATHERS)}` : null,
    emergencyContactRelation: age < 13 ? 'Mother' : null,
  };
}

/** Puts every member without a placement into a random grade of each active class type. */
async function placeInClasses(): Promise<number> {
  const types = await prisma.classType.findMany({
    where: { isActive: true },
    include: { grades: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
  });
  const members = await prisma.member.findMany({
    where: { deletedAt: null, classEnrollments: { none: {} } },
    select: { id: true },
  });
  const data = members.flatMap((m) =>
    types
      .filter((t) => t.grades.length > 0 && rand() < 0.8)
      .map((t) => ({ memberId: m.id, classTypeId: t.id, classGradeId: pick(t.grades).id })),
  );
  if (data.length > 0) await prisma.memberClassEnrollment.createMany({ data });
  return members.length;
}

/** Staffs each empty department: a head, a deputy, a secretary and a few members. */
async function staffDepartments(): Promise<number> {
  const departments = await prisma.department.findMany({
    where: { isActive: true, memberships: { none: {} } },
    select: { id: true },
  });
  const pool = await prisma.member.findMany({
    // Department staff are 13 or older.
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      dateOfBirth: { lte: new Date(Date.now() - 13 * 365.25 * 86_400_000) },
    },
    select: { id: true },
    take: 400,
  });
  const roles = [
    'HEAD',
    'DEPUTY',
    'SECRETARY',
    'MEMBER',
    'MEMBER',
    'MEMBER',
    'MEMBER',
    'MEMBER',
  ] as const;
  const data = departments.flatMap((d) => {
    const chosen = new Set<number>();
    while (chosen.size < roles.length && chosen.size < pool.length) chosen.add(pick(pool).id);
    return [...chosen].map((memberId, i) => ({
      departmentId: d.id,
      memberId,
      role: roles[i]!,
      joinedAt: new Date('2024-09-11T00:00:00.000Z'),
    }));
  });
  if (data.length > 0) await prisma.departmentMembership.createMany({ data });
  return departments.length;
}

/** Demo accounts for trying the department-scoped roles; existing accounts are left alone. */
const DEMO_USERS = [
  {
    email: 'mezmur-admin@fikureegzi.local',
    fullName: 'የመዝሙር ክፍል አስተዳዳሪ',
    role: 'DEPARTMENT_ADMIN',
  },
  {
    email: 'mezmur-attendance@fikureegzi.local',
    fullName: 'የመዝሙር ክፍል አቴንዳንስ ያዥ',
    role: 'ATTENDANCE_TAKER',
  },
] as const;

async function ensureDemoUsers(): Promise<void> {
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) {
    console.log('DEMO_USER_PASSWORD not set — skipping demo accounts');
    return;
  }
  const mezmur = await prisma.department.findUnique({ where: { code: 'MEZMUR' } });
  if (!mezmur) return;
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12));
  for (const u of DEMO_USERS) {
    if (await prisma.user.findUnique({ where: { email: u.email } })) continue;
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    await prisma.user.create({
      data: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        roles: { create: { roleId: role.id } },
        departments: { create: { departmentId: mezmur.id } },
      },
    });
    console.log(`Created ${u.role} ${u.email} for ${mezmur.nameAm}`);
  }
}

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 2000);
  if (count > 0) {
    await prisma.member.createMany({ data: Array.from({ length: count }, demoMember) });
    // Same FE-00042 format the API assigns (MembersService / formatMemberCode).
    await prisma.$executeRaw`UPDATE members SET member_code = CONCAT('FE-', LPAD(id, 5, '0')) WHERE member_code LIKE 'TMP-%'`;
    console.log(`Inserted ${count} demo members`);
  }
  console.log(`Placed ${await placeInClasses()} members into classes`);
  console.log(`Staffed ${await staffDepartments()} departments`);
  await ensureDemoUsers();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
