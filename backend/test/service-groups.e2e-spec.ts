import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

describe('Service groups (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let token: string;
  let prisma: PrismaService;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    http = app.getHttpServer() as App;
    prisma = app.get(PrismaService);
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
      .expect(200);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('terms, groups, distribution, copying and service-group attendance', async () => {
    const type = await prisma.classType.upsert({
      where: { code: 'E2E_SERVICE' },
      update: { isActive: true },
      create: {
        code: 'E2E_SERVICE',
        nameEn: 'Service test',
        nameAm: 'የአገልግሎት ሙከራ',
        isActive: false,
        department: { connect: { code: 'OFFICE' } },
      },
    });
    const grade = await prisma.classGrade.create({
      data: {
        classTypeId: type.id,
        code: `SRV${Date.now() % 1e6}`,
        nameEn: 'Araray test',
        nameAm: 'አራራይ',
        sortOrder: 99,
      },
    });
    const members: { id: number; memberCode: string }[] = [];
    for (const name of ['Aster', 'Bina', 'Chaltu', 'Dina', 'Eden']) {
      const res = await request(http)
        .post('/api/v1/members')
        .set(auth())
        .send({
          firstName: name,
          fatherName: 'Service',
          grandfatherName: `G${RUN}`,
          gender: 'FEMALE',
          dateOfBirth: '2008-01-01',
          classGradeIds: [grade.id],
        })
        .expect(201);
      members.push(res.body.data);
    }

    const term = (
      await request(http)
        .post('/api/v1/service-terms')
        .set(auth())
        .send({
          nameEn: 'Test term A',
          nameAm: 'ሙከራ ሀ',
          startsOn: '2025-09-11',
          endsOn: '2026-09-10',
        })
        .expect(201)
    ).body.data;
    expect(term.isCurrent).toBe(true);
    await request(http)
      .post('/api/v1/service-terms')
      .set(auth())
      .send({ nameEn: 'x', nameAm: 'x', startsOn: '2026-09-11', endsOn: '2026-09-10' })
      .expect(422);

    const g1 = (
      await request(http)
        .post(`/api/v1/service-terms/${term.id}/groups`)
        .set(auth())
        .send({ nameEn: 'Group 1', nameAm: 'ምድብ 1', classGradeId: grade.id })
        .expect(201)
    ).body.data;
    const g2 = (
      await request(http)
        .post(`/api/v1/service-terms/${term.id}/groups`)
        .set(auth())
        .send({ nameEn: 'Group 2', nameAm: 'ምድብ 2', classGradeId: grade.id })
        .expect(201)
    ).body.data;

    // Pre-assign one member, then distribute the other four evenly (smallest group first → 3 / 2).
    await request(http)
      .put(`/api/v1/service-groups/${g1.id}/members`)
      .set(auth())
      .send({ memberIds: [members[0]!.id] })
      .expect(200);
    const dist = (
      await request(http)
        .post(`/api/v1/service-terms/${term.id}/distribute`)
        .set(auth())
        .send({ classGradeId: grade.id, groupIds: [g1.id, g2.id] })
        .expect(200)
    ).body.data;
    expect(dist.assigned).toBe(4);
    let groups = (
      await request(http).get(`/api/v1/service-terms/${term.id}/groups`).set(auth()).expect(200)
    ).body.data;
    expect(groups.map((g: { members: unknown[] }) => g.members.length)).toEqual([3, 2]);

    // Moving a member to another group keeps them in exactly one group this term.
    await request(http)
      .put(`/api/v1/service-groups/${g2.id}/members`)
      .set(auth())
      .send({ memberIds: [members[0]!.id] })
      .expect(200);
    groups = (
      await request(http).get(`/api/v1/service-terms/${term.id}/groups`).set(auth()).expect(200)
    ).body.data;
    expect(groups.map((g: { members: unknown[] }) => g.members.length)).toEqual([2, 3]);

    // A service-group session's roster is the group.
    const session = (
      await request(http)
        .post('/api/v1/attendance/sessions')
        .set(auth())
        .send({
          kind: 'SERVICE_GROUP',
          title: 'Sunday service',
          date: '2026-01-04',
          startTime: '06:00',
          endTime: '09:00',
          serviceGroupId: g2.id,
          classGradeId: grade.id, // ignored for a service group
        })
        .expect(201)
    ).body.data;
    expect(session).toMatchObject({
      rosterSize: 3,
      classGradeId: null,
      serviceGroup: { id: g2.id },
    });
    await request(http)
      .post('/api/v1/attendance/sessions')
      .set(auth())
      .send({
        kind: 'SERVICE_GROUP',
        title: 'x',
        date: '2026-01-04',
        startTime: '06:00',
        endTime: '07:00',
      })
      .expect(422);
    // OTHER with no filters: everyone active.
    await request(http)
      .post('/api/v1/attendance/sessions')
      .set(auth())
      .send({
        kind: 'OTHER',
        title: `Gathering ${RUN}`,
        date: '2026-01-04',
        startTime: '10:00',
        endTime: '11:00',
      })
      .expect(201);
    // A group with sessions is kept for history.
    await request(http).delete(`/api/v1/service-groups/${g2.id}`).set(auth()).expect(409);

    // Next term copies the groups and members; the old term stays as history.
    const next = (
      await request(http)
        .post('/api/v1/service-terms')
        .set(auth())
        .send({
          nameEn: 'Test term B',
          nameAm: 'ሙከራ ለ',
          startsOn: '2026-09-11',
          endsOn: '2027-09-10',
          copyFromTermId: term.id,
          copyMembers: true,
        })
        .expect(201)
    ).body.data;
    const nextGroups = (
      await request(http).get(`/api/v1/service-terms/${next.id}/groups`).set(auth()).expect(200)
    ).body.data;
    expect(
      nextGroups.map((g: { nameEn: string; members: unknown[] }) => [g.nameEn, g.members.length]),
    ).toEqual([
      ['Group 1', 2],
      ['Group 2', 3],
    ]);
    const terms = (await request(http).get('/api/v1/service-terms').set(auth()).expect(200)).body
      .data;
    expect(
      terms.filter((t: { isCurrent: boolean }) => t.isCurrent).map((t: { id: number }) => t.id),
    ).toEqual([next.id]);

    const history = (
      await request(http)
        .get(`/api/v1/members/${members[0]!.id}/service-groups`)
        .set(auth())
        .expect(200)
    ).body.data;
    expect(history.map((h: { term: { id: number } }) => h.term.id)).toEqual([next.id, term.id]);
  });
});
