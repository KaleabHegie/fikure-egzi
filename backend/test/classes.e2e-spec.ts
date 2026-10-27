import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

interface Grade {
  id: number;
  code: string;
  shortLabel: string | null;
  memberCount: number;
}
interface ClassType {
  id: number;
  code: string;
  grades: Grade[];
}

describe('Classes API (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    http = app.getHttpServer() as App;
    // Leftovers from a previous run.
    const prisma = app.get(PrismaService);
    const old = await prisma.classType.findUnique({ where: { code: 'E2E_CHOIR' } });
    if (old) {
      await prisma.memberClassEnrollment.deleteMany({ where: { classTypeId: old.id } });
      await prisma.classPlacementHistory.deleteMany({ where: { classTypeId: old.id } });
      await prisma.classGrade.deleteMany({ where: { classTypeId: old.id } });
      await prisma.classType.delete({ where: { id: old.id } });
    }

    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
      .expect(200);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const listTypes = async (): Promise<ClassType[]> =>
    (await request(http).get('/api/v1/class-types').set(auth()).expect(200)).body.data;

  it('lists the seeded Mezmur and Course classes in order', async () => {
    const types = await listTypes();
    const mezmur = types.find((t) => t.code === 'MEZMUR')!;
    const course = types.find((t) => t.code === 'COURSE')!;
    expect(mezmur.grades.map((g) => g.shortLabel)).toEqual(['ሐ', 'ለ', 'ሀ']);
    expect(course.grades).toHaveLength(12);
  });

  it('creates, reorders and protects a configurable class type', async () => {
    const departments = (await request(http).get('/api/v1/departments').set(auth()).expect(200))
      .body.data as { id: number; code: string }[];
    const mezmurDept = departments.find((d) => d.code === 'MEZMUR')!;
    // Every class belongs to a department.
    await request(http)
      .post('/api/v1/class-types')
      .set(auth())
      .send({ code: 'e2e_choir', nameEn: 'Choir', nameAm: 'መዘምራን' })
      .expect(422);
    const type = (
      await request(http)
        .post('/api/v1/class-types')
        .set(auth())
        .send({ code: 'e2e_choir', nameEn: 'Choir', nameAm: 'መዘምራን', departmentId: mezmurDept.id })
        .expect(201)
    ).body.data;
    expect(type.departmentId).toBe(mezmurDept.id);
    await request(http).delete(`/api/v1/departments/${mezmurDept.id}`).set(auth()).expect(409);
    expect(type.code).toBe('E2E_CHOIR');

    const a = (
      await request(http)
        .post(`/api/v1/class-types/${type.id}/grades`)
        .set(auth())
        .send({ code: 'A', nameEn: 'Beginner', nameAm: 'ጀማሪ' })
        .expect(201)
    ).body.data;
    const b = (
      await request(http)
        .post(`/api/v1/class-types/${type.id}/grades`)
        .set(auth())
        .send({ code: 'B', nameEn: 'Advanced', nameAm: 'ከፍተኛ' })
        .expect(201)
    ).body.data;

    await request(http)
      .post(`/api/v1/class-types/${type.id}/grades`)
      .set(auth())
      .send({ code: 'A', nameEn: 'Dup', nameAm: 'Dup' })
      .expect(409);

    await request(http)
      .put(`/api/v1/class-types/${type.id}/grades/order`)
      .set(auth())
      .send({ ids: [b.id, a.id] })
      .expect(204);
    const reordered = (await listTypes()).find((t) => t.id === type.id)!;
    expect(reordered.grades.map((g) => g.code)).toEqual(['B', 'A']);

    // Place a member in grade B, then try to delete it.
    const member = (
      await request(http)
        .post('/api/v1/members')
        .set(auth())
        .send({
          firstName: 'Mahlet',
          fatherName: 'Desta',
          grandfatherName: `G${RUN}`,
          gender: 'FEMALE',
          dateOfBirth: '2010-01-01',
          classGradeIds: [b.id],
        })
        .expect(201)
    ).body.data;
    expect(member.classes).toEqual([
      expect.objectContaining({
        classType: expect.objectContaining({ code: 'E2E_CHOIR' }),
        classGrade: expect.objectContaining({ code: 'B' }),
      }),
    ]);

    const filtered = await request(http)
      .get(`/api/v1/members?classGradeId=${b.id}`)
      .set(auth())
      .expect(200);
    expect(filtered.body.data.map((m: { id: number }) => m.id)).toEqual([member.id]);

    await request(http).delete(`/api/v1/class-grades/${b.id}`).set(auth()).expect(409);

    // Deactivated grades vanish from the default list but stay on the member.
    await request(http)
      .patch(`/api/v1/class-grades/${b.id}`)
      .set(auth())
      .send({ isActive: false })
      .expect(200);
    expect((await listTypes()).find((t) => t.id === type.id)!.grades.map((g) => g.code)).toEqual([
      'A',
    ]);
    await request(http)
      .patch(`/api/v1/members/${member.id}`)
      .set(auth())
      .send({ classGradeIds: [b.id], notes: 'still in B' })
      .expect(200);

    // Even after the member moves on, B keeps their history, so it can only be deactivated.
    await request(http)
      .patch(`/api/v1/members/${member.id}`)
      .set(auth())
      .send({ classGradeIds: [a.id] })
      .expect(200);
    const blocked = await request(http)
      .delete(`/api/v1/class-grades/${b.id}`)
      .set(auth())
      .expect(409);
    expect(blocked.body.message).toMatch(/history/);

    // A grade nobody was ever in can be deleted.
    const unused = (
      await request(http)
        .post(`/api/v1/class-types/${type.id}/grades`)
        .set(auth())
        .send({ code: 'C', nameEn: 'Unused', nameAm: 'ያልተጠቀመ' })
        .expect(201)
    ).body.data;
    await request(http).delete(`/api/v1/class-grades/${unused.id}`).set(auth()).expect(204);

    await request(http).delete(`/api/v1/class-types/${type.id}`).set(auth()).expect(409);
  });
});
