import type { PrismaService } from '../../prisma/prisma.service.js';

/** What an audit entry was about, in words: "ቃለአብ ህገ መንግስት" rather than "User #8". */
export interface AuditTarget {
  am: string;
  en: string;
  /** A member ID, asset code or email that identifies it at a glance. */
  code: string | null;
}

type Named = { nameAm: string; nameEn: string | null };
type Person = {
  memberCode: string;
  firstName: string;
  fatherName: string;
  grandfatherName: string | null;
};

const both = (n: Named, code: string | null = null): AuditTarget => ({
  am: n.nameAm,
  en: n.nameEn || n.nameAm,
  code,
});
const person = (m: Person): AuditTarget => {
  const name = [m.firstName, m.fatherName, m.grandfatherName].filter(Boolean).join(' ');
  return { am: name, en: name, code: m.memberCode };
};
const joined = (a: AuditTarget, b: Named): AuditTarget => ({
  am: `${a.am} · ${b.nameAm}`,
  en: `${a.en} · ${b.nameEn || b.nameAm}`,
  code: a.code,
});
const day = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

const PERSON = {
  memberCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
} as const;
const NAMES = { nameAm: true, nameEn: true } as const;

type Lookup = (ids: number[]) => Promise<[number, AuditTarget][]>;

/**
 * How to name each kind of record. Deleted records keep their entries but
 * are no longer found; those fall back to the id.
 */
const lookups = (prisma: PrismaService): Record<string, Lookup> => {
  const members: Lookup = async (ids) =>
    (
      await prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, ...PERSON } })
    ).map((m) => [m.id, person(m)]);
  return {
    Member: members,
    MemberPortal: members,
    User: async (ids) =>
      (
        await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true, email: true },
        })
      ).map((u) => [u.id, { am: u.fullName, en: u.fullName, code: u.email }]),
    Department: async (ids) =>
      (
        await prisma.department.findMany({
          where: { id: { in: ids } },
          select: { id: true, ...NAMES },
        })
      ).map((d) => [d.id, both(d)]),
    DepartmentMembership: async (ids) =>
      (
        await prisma.departmentMembership.findMany({
          where: { id: { in: ids } },
          select: { id: true, member: { select: PERSON }, department: { select: NAMES } },
        })
      ).map((r) => [r.id, joined(person(r.member), r.department)]),
    ClassType: async (ids) =>
      (
        await prisma.classType.findMany({
          where: { id: { in: ids } },
          select: { id: true, ...NAMES },
        })
      ).map((c) => [c.id, both(c)]),
    ClassGrade: async (ids) =>
      (
        await prisma.classGrade.findMany({
          where: { id: { in: ids } },
          select: { id: true, ...NAMES, classType: { select: NAMES } },
        })
      ).map((g) => [
        g.id,
        {
          am: `${g.classType.nameAm} · ${g.nameAm}`,
          en: `${g.classType.nameEn || g.classType.nameAm} · ${g.nameEn || g.nameAm}`,
          code: null,
        },
      ]),
    ClassAgreement: async (ids) =>
      (
        await prisma.classAgreement.findMany({
          where: { id: { in: ids } },
          select: { id: true, classType: { select: NAMES } },
        })
      ).map((a) => [a.id, both(a.classType)]),
    ServiceTerm: async (ids) =>
      (
        await prisma.serviceTerm.findMany({
          where: { id: { in: ids } },
          select: { id: true, ...NAMES },
        })
      ).map((t) => [t.id, both(t)]),
    ServiceGroup: async (ids) =>
      (
        await prisma.serviceGroup.findMany({
          where: { id: { in: ids } },
          select: { id: true, ...NAMES },
        })
      ).map((g) => [g.id, both(g)]),
    AttendanceSession: async (ids) =>
      (
        await prisma.attendanceSession.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, startsAt: true },
        })
      ).map((s) => [s.id, { am: s.title, en: s.title, code: day(s.startsAt) }]),
    LatePermission: async (ids) =>
      (
        await prisma.latePermission.findMany({
          where: { id: { in: ids } },
          select: { id: true, member: { select: PERSON } },
        })
      ).map((p) => [p.id, person(p.member)]),
    Course: async (ids) =>
      (
        await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, ...NAMES } })
      ).map((c) => [c.id, both(c)]),
    CourseOffering: async (ids) =>
      (
        await prisma.courseOffering.findMany({
          where: { id: { in: ids } },
          select: { id: true, startDate: true, course: { select: NAMES } },
        })
      ).map((o) => [o.id, both(o.course, day(o.startDate))]),
    Exam: async (ids) =>
      (
        await prisma.exam.findMany({ where: { id: { in: ids } }, select: { id: true, ...NAMES } })
      ).map((e) => [e.id, both(e)]),
    Asset: async (ids) =>
      (
        await prisma.asset.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, assetCode: true },
        })
      ).map((a) => [a.id, { am: a.name, en: a.name, code: a.assetCode }]),
    AssetCategory: async (ids) =>
      (
        await prisma.assetCategory.findMany({
          where: { id: { in: ids } },
          select: { id: true, ...NAMES },
        })
      ).map((c) => [c.id, both(c)]),
  };
};

/** Names the records a page of audit entries refers to, keyed "Entity:id". */
export async function auditTargets(
  prisma: PrismaService,
  rows: { entity: string; entityId: string | null }[],
): Promise<Map<string, AuditTarget>> {
  const byEntity = new Map<string, Set<number>>();
  for (const r of rows) {
    const id = Number(r.entityId);
    if (!r.entityId || !Number.isInteger(id)) continue;
    byEntity.set(r.entity, (byEntity.get(r.entity) ?? new Set()).add(id));
  }
  const known = lookups(prisma);
  const found = new Map<string, AuditTarget>();
  await Promise.all(
    [...byEntity].map(async ([entity, ids]) => {
      const lookup = known[entity];
      if (!lookup) return;
      for (const [id, target] of await lookup([...ids])) found.set(`${entity}:${id}`, target);
    }),
  );
  return found;
}
