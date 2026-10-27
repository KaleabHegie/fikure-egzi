import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

const RUN = Date.now().toString(36);

describe('Member portal (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let staff: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    http = app.getHttpServer() as App;
    staff = (
      await request(http)
        .post('/api/v1/auth/login')
        .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
        .expect(200)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a member see their own record with their ID and phone number, and nothing else', async () => {
    const member = (
      await request(http)
        .post('/api/v1/members')
        .set({ Authorization: `Bearer ${staff}` })
        .send({
          firstName: 'Portal',
          fatherName: 'Member',
          grandfatherName: `G${RUN}`,
          gender: 'FEMALE',
          dateOfBirth: '2005-01-01',
          phone: '0911 22 33 44',
          notes: 'Internal staff note',
        })
        .expect(201)
    ).body.data as { id: number; memberCode: string };

    // Wrong phone and unknown ID get the same answer.
    const wrong = await request(http)
      .post('/api/v1/portal/login')
      .send({ code: member.memberCode, phone: '0999999999' })
      .expect(401);
    const unknown = await request(http)
      .post('/api/v1/portal/login')
      .send({ code: 'FE-99999', phone: '0911223344' })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);

    // The digits of the ID and a +251 phone work.
    const digits = String(Number(member.memberCode.slice(3)));
    const { token, expiresIn } = (
      await request(http)
        .post('/api/v1/portal/login')
        .send({ code: digits, phone: '+251 911 223 344' })
        .expect(200)
    ).body.data;
    expect(expiresIn).toBeGreaterThan(0);
    const portal = { Authorization: `Bearer ${token}` };

    const me = (await request(http).get('/api/v1/portal/me').set(portal).expect(200)).body.data;
    expect(me).toMatchObject({ id: member.id, memberCode: member.memberCode, firstName: 'Portal' });
    expect(me).not.toHaveProperty('notes');
    expect(me).not.toHaveProperty('createdBy');
    const attendance = (
      await request(http).get('/api/v1/portal/me/attendance').set(portal).expect(200)
    ).body.data;
    expect(attendance).toMatchObject({ sessions: 0, records: [] });
    await request(http).get('/api/v1/portal/me/photo').set(portal).expect(404);

    // A member token is not a staff token, and the other way round.
    await request(http).get('/api/v1/members').set(portal).expect(401);
    await request(http).get(`/api/v1/members/${member.id}`).set(portal).expect(401);
    await request(http)
      .get('/api/v1/portal/me')
      .set({ Authorization: `Bearer ${staff}` })
      .expect(401);
    await request(http).get('/api/v1/portal/me').expect(401);
  });
});
