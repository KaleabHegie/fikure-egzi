import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

/**
 * Exercises the real HTTP stack (guards, pipes, filters, interceptor) against
 * the test database. Prepare it once with `npm run test:e2e:prepare`.
 */
describe('Members API (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    http = app.getHttpServer() as App;

    const prisma = app.get(PrismaService);
    await prisma.auditLog.deleteMany();
    await prisma.memberClassEnrollment.deleteMany();
    await prisma.classPlacementHistory.deleteMany();
    await prisma.departmentServiceHistory.deleteMany();
    await prisma.departmentMembership.deleteMany();
    await prisma.member.deleteMany();

    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL,
        password: process.env.SEED_ADMIN_PASSWORD,
      })
      .expect(200);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('rejects unauthenticated requests with the standard error shape', async () => {
    const res = await request(http).get('/api/v1/members').expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      path: '/api/v1/members',
    });
  });

  it('returns field-level validation errors', async () => {
    const res = await request(http)
      .post('/api/v1/members')
      .set(auth())
      .send({
        firstName: '',
        gender: 'X',
        joinedAt: '07/01/2024',
        phone: '12345',
      })
      .expect(422);
    const fields = (res.body.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['firstName', 'fatherName', 'gender', 'joinedAt', 'phone']),
    );
  });

  it('registers, finds, updates and soft-deletes a member', async () => {
    const created = await request(http)
      .post('/api/v1/members')
      .set(auth())
      .send({
        firstName: 'Abebe',
        fatherName: 'Kebede',
        grandfatherName: `G${RUN}`,
        gender: 'MALE',
        dateOfBirth: '2005-09-11',
        joinedAt: '2024-01-07',
        phone: '+251 911 223 344',
      })
      .expect(201);
    const member = created.body.data;
    expect(member.memberCode).toMatch(/^FE-\d{5}$/);

    // Full names are unique (case doesn't matter).
    const twin = await request(http)
      .post('/api/v1/members')
      .set(auth())
      .send({
        firstName: 'ABEBE',
        fatherName: 'kebede',
        grandfatherName: `g${RUN}`,
        gender: 'MALE',
        dateOfBirth: '2001-01-01',
      })
      .expect(422);
    expect(twin.body.details[0]).toMatchObject({ field: 'firstName' });
    expect(twin.body.details[0].messages[0]).toContain(member.memberCode);
    expect(member.phone).toBe('0911223344');

    const list = await request(http)
      .get('/api/v1/members?search=abebe%20keb')
      .set(auth())
      .expect(200);
    expect(list.body.meta.total).toBe(1);

    const updated = await request(http)
      .patch(`/api/v1/members/${member.id}`)
      .set(auth())
      .send({ christianName: 'Wolde Mariam', status: 'INACTIVE' })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      christianName: 'Wolde Mariam',
      status: 'INACTIVE',
    });

    await request(http).delete(`/api/v1/members/${member.id}`).set(auth()).expect(204);
    await request(http).get(`/api/v1/members/${member.id}`).set(auth()).expect(404);
  });

  it('uploads, serves and removes a member photo', async () => {
    const { body } = await request(http)
      .post('/api/v1/members')
      .set(auth())
      .send({
        firstName: 'Selam',
        fatherName: 'Girma',
        grandfatherName: `G${RUN}`,
        gender: 'FEMALE',
        dateOfBirth: '2018-03-04',
      })
      .expect(201);
    const id = body.data.id as number;
    expect(body.data).toMatchObject({ hasPhoto: false });

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    await request(http)
      .put(`/api/v1/members/${id}/photo`)
      .set(auth())
      .attach('photo', Buffer.from('<svg/>'), { filename: 'evil.png', contentType: 'image/png' })
      .expect(422);

    const uploaded = await request(http)
      .put(`/api/v1/members/${id}/photo`)
      .set(auth())
      .attach('photo', png, { filename: 'face.png', contentType: 'image/png' })
      .expect(200);
    expect(uploaded.body.data.hasPhoto).toBe(true);

    await request(http).get(`/api/v1/members/${id}/photo`).expect(401);
    const served = await request(http).get(`/api/v1/members/${id}/photo`).set(auth()).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(served.body as Buffer, png)).toBe(0);

    const removed = await request(http)
      .delete(`/api/v1/members/${id}/photo`)
      .set(auth())
      .expect(200);
    expect(removed.body.data.hasPhoto).toBe(false);
    await request(http).get(`/api/v1/members/${id}/photo`).set(auth()).expect(404);
  });
});
