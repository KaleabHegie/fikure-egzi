import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

const RUN = Date.now().toString(36);

describe('Own profile (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (email: string, password: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    http = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets any user edit their own details and change their password', async () => {
    const admin = (
      await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!).expect(200)
    ).body.data.accessToken as string;
    const email = `me${RUN}@test.local`;
    const password = 'Str0ng-pass!';
    await request(http)
      .post('/api/v1/users')
      .set(as(admin))
      .send({
        fullName: 'Taker',
        email,
        password,
        roleCode: 'ATTENDANCE_TAKER',
        departmentIds: [1],
      })
      .expect(201);

    // Two devices.
    const phone = (await login(email, password).expect(200)).body.data;
    const laptop = (await login(email, password).expect(200)).body.data;

    const profile = (
      await request(http).get('/api/v1/auth/profile').set(as(phone.accessToken)).expect(200)
    ).body.data;
    expect(profile).toMatchObject({ email, fullName: 'Taker', role: { code: 'ATTENDANCE_TAKER' } });

    const updated = (
      await request(http)
        .patch('/api/v1/auth/profile')
        .set(as(phone.accessToken))
        .send({ fullName: 'Hanna Girma', phone: '0911223344' })
        .expect(200)
    ).body.data;
    expect(updated).toMatchObject({ fullName: 'Hanna Girma', phone: '0911223344' });

    // A new email needs the current password.
    const newEmail = `me2${RUN}@test.local`;
    await request(http)
      .patch('/api/v1/auth/profile')
      .set(as(phone.accessToken))
      .send({ email: newEmail })
      .expect(422);
    await request(http)
      .patch('/api/v1/auth/profile')
      .set(as(phone.accessToken))
      .send({ email: newEmail, currentPassword: password })
      .expect(200);

    // Password: the current one must match; other devices are signed out, this one stays.
    const changeBody = { currentPassword: 'wrong-one', newPassword: 'N3w-password!' };
    await request(http)
      .put('/api/v1/auth/password')
      .set(as(phone.accessToken))
      .send(changeBody)
      .expect(422);
    await request(http)
      .put('/api/v1/auth/password')
      .set(as(phone.accessToken))
      .send({ ...changeBody, currentPassword: password, refreshToken: phone.refreshToken })
      .expect(204);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: laptop.refreshToken })
      .expect(401);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: phone.refreshToken })
      .expect(200);
    await login(newEmail, password).expect(401);
    await login(newEmail, 'N3w-password!').expect(200);
  });
});
