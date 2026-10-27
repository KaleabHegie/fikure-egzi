import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

interface Dept {
  id: number;
  code: string;
  parentId: number | null;
  memberCount: number;
  head: { id: number } | null;
}

describe('Departments API (e2e)', () => {
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

    const prisma = app.get(PrismaService);
    await prisma.departmentMembership.deleteMany();
    await prisma.departmentServiceHistory.deleteMany();
    await prisma.department.deleteMany({ where: { code: { startsWith: 'E2E_' } } });

    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
      .expect(200);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const list = async (): Promise<Dept[]> =>
    (await request(http).get('/api/v1/departments').set(auth()).expect(200)).body.data;

  it('seeds ፅህፈት ቤት with 8 departments under it', async () => {
    const departments = await list();
    const office = departments.find((d) => d.code === 'OFFICE')!;
    expect(office.parentId).toBeNull();
    expect(departments.filter((d) => d.parentId === office.id)).toHaveLength(8);
  });

  it('manages the tree and the people serving in a department', async () => {
    const office = (await list()).find((d) => d.code === 'OFFICE')!;
    const dept = (
      await request(http)
        .post('/api/v1/departments')
        .set(auth())
        .send({ code: 'e2e_choir', nameEn: 'Choir', nameAm: 'መዘምራን', parentId: office.id })
        .expect(201)
    ).body.data;

    // The office cannot be moved under its own sub-department.
    await request(http)
      .patch(`/api/v1/departments/${office.id}`)
      .set(auth())
      .send({ parentId: dept.id })
      .expect(422);

    const newMember = async (firstName: string) =>
      (
        await request(http)
          .post('/api/v1/members')
          .set(auth())
          .send({
            firstName,
            fatherName: 'Test',
            grandfatherName: `G${RUN}`,
            gender: 'MALE',
            dateOfBirth: '2000-01-01',
          })
          .expect(201)
      ).body.data.id as number;
    const a = await newMember('Abel');
    const b = await newMember('Bereket');

    const head = (
      await request(http)
        .post(`/api/v1/departments/${dept.id}/members`)
        .set(auth())
        .send({ memberId: a, role: 'HEAD' })
        .expect(201)
    ).body.data;
    // Only one head per department, and no duplicate membership.
    await request(http)
      .post(`/api/v1/departments/${dept.id}/members`)
      .set(auth())
      .send({ memberId: b, role: 'HEAD' })
      .expect(409);
    await request(http)
      .post(`/api/v1/departments/${dept.id}/members`)
      .set(auth())
      .send({ memberId: a })
      .expect(409);
    await request(http)
      .post(`/api/v1/departments/${dept.id}/members`)
      .set(auth())
      .send({ memberId: b, role: 'SECRETARY' })
      .expect(201);

    const roster = (
      await request(http).get(`/api/v1/departments/${dept.id}/members`).set(auth()).expect(200)
    ).body.data;
    expect(roster.map((r: { role: string }) => r.role)).toEqual(['HEAD', 'SECRETARY']);

    const summary = (await list()).find((d) => d.id === dept.id)!;
    expect(summary).toMatchObject({ memberCount: 2, head: { id: a } });

    const member = (await request(http).get(`/api/v1/members/${a}`).set(auth()).expect(200)).body
      .data;
    expect(member.departments).toEqual([
      expect.objectContaining({
        role: 'HEAD',
        department: expect.objectContaining({ code: 'E2E_CHOIR' }),
      }),
    ]);
    const filtered = (
      await request(http).get(`/api/v1/members?departmentId=${dept.id}`).set(auth()).expect(200)
    ).body.meta.total;
    expect(filtered).toBe(2);

    await request(http).delete(`/api/v1/departments/${dept.id}`).set(auth()).expect(409);
    await request(http)
      .patch(`/api/v1/department-memberships/${head.id}`)
      .set(auth())
      .send({ role: 'MEMBER' })
      .expect(200);
    await request(http).delete(`/api/v1/department-memberships/${head.id}`).set(auth()).expect(204);
  });
});
