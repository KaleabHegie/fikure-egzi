import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

interface ClassPeriod {
  classGrade: { code: string };
  startedAt: string;
  endedAt: string | null;
}
interface ServicePeriod {
  department: { code: string };
  role: string;
  endedAt: string | null;
}

describe('History (e2e)', () => {
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
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
      .expect(200);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps every class grade and department period a member has had', async () => {
    const types = (await request(http).get('/api/v1/class-types').set(auth()).expect(200)).body
      .data as {
      code: string;
      grades: { id: number; code: string }[];
    }[];
    const course = types.find((t) => t.code === 'COURSE')!;
    const [g1, g2, g3] = course.grades;

    const member = (
      await request(http)
        .post('/api/v1/members')
        .set(auth())
        .send({
          firstName: 'Yared',
          fatherName: 'Alemu',
          grandfatherName: `G${RUN}`,
          gender: 'MALE',
          dateOfBirth: '2014-02-02',
          classGradeIds: [g1!.id],
        })
        .expect(201)
    ).body.data;

    // Promoted 1 → 2 → 3. Editing other fields must not touch class history.
    await request(http)
      .patch(`/api/v1/members/${member.id}`)
      .set(auth())
      .send({ classGradeIds: [g2!.id] })
      .expect(200);
    await request(http)
      .patch(`/api/v1/members/${member.id}`)
      .set(auth())
      .send({ notes: 'unrelated edit' })
      .expect(200);
    await request(http)
      .patch(`/api/v1/members/${member.id}`)
      .set(auth())
      .send({ classGradeIds: [g3!.id] })
      .expect(200);

    // Departments: joins Education as Member, becomes Head, then moves to Finance.
    const departments = (await request(http).get('/api/v1/departments').set(auth()).expect(200))
      .body.data as {
      id: number;
      code: string;
    }[];
    const education = departments.find((d) => d.code === 'EDUCATION')!;
    const media = departments.find((d) => d.code === 'MEDIA')!;
    const edu = (
      await request(http)
        .post(`/api/v1/departments/${education.id}/members`)
        .set(auth())
        .send({ memberId: member.id, role: 'MEMBER', joinedAt: '2025-09-11' })
        .expect(201)
    ).body.data;
    await request(http)
      .patch(`/api/v1/department-memberships/${edu.id}`)
      .set(auth())
      .send({ role: 'SECRETARY' })
      .expect(200);
    await request(http).delete(`/api/v1/department-memberships/${edu.id}`).set(auth()).expect(204);
    await request(http)
      .post(`/api/v1/departments/${media.id}/members`)
      .set(auth())
      .send({ memberId: member.id })
      .expect(201);

    const history = (
      await request(http).get(`/api/v1/members/${member.id}/history`).set(auth()).expect(200)
    ).body.data as { classes: ClassPeriod[]; departments: ServicePeriod[] };

    // Newest first; only the latest grade is open.
    expect(history.classes.map((c) => [c.classGrade.code, c.endedAt === null])).toEqual([
      [g3!.code, true],
      [g2!.code, false],
      [g1!.code, false],
    ]);
    expect(history.departments.map((d) => [d.department.code, d.role, d.endedAt === null])).toEqual(
      [
        ['MEDIA', 'MEMBER', true],
        ['EDUCATION', 'SECRETARY', false],
        ['EDUCATION', 'MEMBER', false],
      ],
    );

    // Education's "former members" lists the ended periods.
    const former = (
      await request(http).get(`/api/v1/departments/${education.id}/history`).set(auth()).expect(200)
    ).body.data as { member: { id: number }; role: string }[];
    expect(
      former
        .filter((f) => f.member.id === member.id)
        .map((f) => f.role)
        .sort(),
    ).toEqual(['MEMBER', 'SECRETARY']);
  });
});
