import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const RUN = Date.now().toString(36);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Assets (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let prisma: PrismaService;
  let admin: string;
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string, password: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password }).expect(200)).body.data
      .accessToken as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    http = app.getHttpServer() as App;
    prisma = app.get(PrismaService);
    admin = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers assets with a photo and a responsible department, scoped for department admins', async () => {
    const mezmur = await prisma.department.findUniqueOrThrow({ where: { code: 'MEZMUR' } });
    const education = await prisma.department.findUniqueOrThrow({ where: { code: 'EDUCATION' } });

    // Office admin registers a Mezmur asset.
    await request(http)
      .post('/api/v1/assets')
      .set(as(admin))
      .send({ name: 'No department', category: 'OTHER' })
      .expect(422);
    const drum = (
      await request(http)
        .post('/api/v1/assets')
        .set(as(admin))
        .send({
          name: `Kebero ${RUN}`,
          category: 'MUSICAL_INSTRUMENT',
          departmentId: mezmur.id,
          quantity: 2,
          condition: 'GOOD',
          acquisition: 'DONATED',
          acquiredOn: '2025-09-14',
          cost: 3500.5,
          donorName: 'A parishioner',
          location: 'Mezmur room',
        })
        .expect(201)
    ).body.data;
    expect(drum).toMatchObject({
      assetCode: expect.stringMatching(/^AS-\d{5}$/),
      status: 'IN_USE',
      cost: 3500.5,
      hasPhoto: false,
      department: { id: mezmur.id },
    });

    // Photo: only real images.
    await request(http)
      .put(`/api/v1/assets/${drum.id}/photo`)
      .set(as(admin))
      .attach('photo', Buffer.from('nope'), 'x.png')
      .expect(422);
    const withPhoto = (
      await request(http)
        .put(`/api/v1/assets/${drum.id}/photo`)
        .set(as(admin))
        .attach('photo', PNG, 'drum.png')
        .expect(200)
    ).body.data;
    expect(withPhoto.hasPhoto).toBe(true);
    const photo = await request(http)
      .get(`/api/v1/assets/${drum.id}/photo`)
      .set(as(admin))
      .expect(200);
    expect(photo.headers['content-type']).toBe('image/png');

    // A Mezmur department admin sees and manages Mezmur assets only.
    const password = 'Str0ng-pass!';
    await request(http)
      .post('/api/v1/users')
      .set(as(admin))
      .send({
        fullName: 'Asset Admin',
        email: `assets${RUN}@test.local`,
        password,
        roleCode: 'DEPARTMENT_ADMIN',
        departmentIds: [mezmur.id],
      })
      .expect(201);
    const deptAdmin = await login(`assets${RUN}@test.local`, password);
    const book = (
      await request(http)
        .post('/api/v1/assets')
        .set(as(admin))
        .send({ name: `Book ${RUN}`, category: 'BOOKS', departmentId: education.id })
        .expect(201)
    ).body.data;
    const visible = (
      await request(http).get(`/api/v1/assets?search=${RUN}`).set(as(deptAdmin)).expect(200)
    ).body;
    expect(visible.data.map((a: { id: number }) => a.id)).toEqual([drum.id]);
    expect(visible.meta.totals).toMatchObject({ assets: 1, items: 2, value: 3500.5 });
    await request(http).get(`/api/v1/assets/${book.id}`).set(as(deptAdmin)).expect(403);
    await request(http)
      .post('/api/v1/assets')
      .set(as(deptAdmin))
      .send({ name: 'x', category: 'OTHER', departmentId: education.id })
      .expect(403);
    await request(http)
      .patch(`/api/v1/assets/${drum.id}`)
      .set(as(deptAdmin))
      .send({ departmentId: education.id })
      .expect(403);
    await request(http)
      .patch(`/api/v1/assets/${drum.id}`)
      .set(as(deptAdmin))
      .send({ status: 'UNDER_REPAIR', condition: 'POOR' })
      .expect(200);

    // A department responsible for assets can't be deleted; assets can.
    await request(http).delete(`/api/v1/departments/${mezmur.id}`).set(as(admin)).expect(409);
    await request(http).delete(`/api/v1/assets/${drum.id}`).set(as(deptAdmin)).expect(204);
    await request(http).delete(`/api/v1/assets/${book.id}`).set(as(admin)).expect(204);
  });
});
