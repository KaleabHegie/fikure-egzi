import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

describe('Users & department-scoped access (e2e)', () => {
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

  it('office admin, department admin and attendance taker each stay in their lane', async () => {
    const run = Date.now() % 1e8;
    const mezmur = await prisma.department.findUniqueOrThrow({ where: { code: 'MEZMUR' } });
    const education = await prisma.department.findUniqueOrThrow({ where: { code: 'EDUCATION' } });

    // A class run by each department, each with one member.
    const gradeOf = async (code: string, departmentId: number) => {
      const type = await prisma.classType.upsert({
        where: { code },
        update: { departmentId, isActive: true },
        create: { code, nameEn: code, nameAm: code, departmentId },
      });
      return prisma.classGrade.create({
        data: { classTypeId: type.id, code: `G${run}`, nameEn: 'G', nameAm: 'G', sortOrder: 99 },
      });
    };
    const mezmurGrade = await gradeOf('E2E_SCOPE_MEZMUR', mezmur.id);
    const educationGrade = await gradeOf('E2E_SCOPE_EDU', education.id);
    const member = (
      await request(http)
        .post('/api/v1/members')
        .set(as(admin))
        .send({
          firstName: 'Scope',
          fatherName: 'Test',
          grandfatherName: `G${RUN}`,
          gender: 'MALE',
          dateOfBirth: '2010-01-01',
          classGradeIds: [mezmurGrade.id, educationGrade.id],
        })
        .expect(201)
    ).body.data;

    // Office admin creates a Mezmur department admin; scoped roles need a department.
    const password = 'Str0ng-pass!';
    await request(http)
      .post('/api/v1/users')
      .set(as(admin))
      .send({
        fullName: 'No dept',
        email: `nodept${run}@test.local`,
        password,
        roleCode: 'DEPARTMENT_ADMIN',
      })
      .expect(422);
    const deptAdminUser = (
      await request(http)
        .post('/api/v1/users')
        .set(as(admin))
        .send({
          fullName: 'Mezmur Admin',
          email: `mezmur-admin${run}@test.local`,
          password,
          roleCode: 'DEPARTMENT_ADMIN',
          departmentIds: [mezmur.id],
        })
        .expect(201)
    ).body.data;
    expect(deptAdminUser).toMatchObject({
      role: { code: 'DEPARTMENT_ADMIN' },
      departments: [{ id: mezmur.id }],
    });
    await request(http)
      .post('/api/v1/users')
      .set(as(admin))
      .send({
        fullName: 'Dup',
        email: `mezmur-admin${run}@test.local`,
        password,
        roleCode: 'SUPER_ADMIN',
      })
      .expect(409);

    const deptAdmin = await login(`mezmur-admin${run}@test.local`, password);
    const me = (await request(http).get('/api/v1/auth/me').set(as(deptAdmin)).expect(200)).body
      .data;
    expect(me.departmentIds).toEqual([mezmur.id]);

    // Department admin: only attendance takers, only in their own department.
    const roles = (await request(http).get('/api/v1/users/roles').set(as(deptAdmin)).expect(200))
      .body.data;
    expect(roles.map((r: { code: string }) => r.code)).toEqual(['ATTENDANCE_TAKER', 'TEACHER']);
    const newUser = (roleCode: string, departmentIds: number[], email: string) =>
      request(http)
        .post('/api/v1/users')
        .set(as(deptAdmin))
        .send({ fullName: 'Taker', email, password, roleCode, departmentIds });
    await newUser('DEPARTMENT_ADMIN', [mezmur.id], `x${run}@test.local`).expect(403);
    await newUser('ATTENDANCE_TAKER', [education.id], `y${run}@test.local`).expect(403);
    const takerUser = (
      await newUser('ATTENDANCE_TAKER', [mezmur.id], `taker${run}@test.local`).expect(201)
    ).body.data;
    const visible = (await request(http).get('/api/v1/users').set(as(deptAdmin)).expect(200)).body
      .data;
    expect(
      visible.every((u: { role: { code: string } }) => u.role.code === 'ATTENDANCE_TAKER'),
    ).toBe(true);
    expect(visible.some((u: { id: number }) => u.id === takerUser.id)).toBe(true);
    await request(http)
      .patch(`/api/v1/users/${deptAdminUser.id}`)
      .set(as(deptAdmin))
      .send({ fullName: 'Promoted?' })
      .expect(404);

    // Roster: own department only; takers can't touch rosters.
    const taker = await login(`taker${run}@test.local`, password);
    await request(http)
      .post(`/api/v1/departments/${education.id}/members`)
      .set(as(deptAdmin))
      .send({ memberId: member.id, role: 'MEMBER' })
      .expect(403);
    await request(http)
      .post(`/api/v1/departments/${mezmur.id}/members`)
      .set(as(taker))
      .send({ memberId: member.id, role: 'MEMBER' })
      .expect(403);
    await request(http)
      .post(`/api/v1/departments/${mezmur.id}/members`)
      .set(as(deptAdmin))
      .send({ memberId: member.id, role: 'MEMBER' })
      .expect(201);

    // Attendance: the taker runs Mezmur classes, not Education ones.
    // Attendance takers work on today's sessions only (Addis Ababa date).
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const session = (body: object, token: string) =>
      request(http)
        .post('/api/v1/attendance/sessions')
        .set(as(token))
        .send({
          title: `Scope ${RUN}`,
          date: today,
          startTime: '00:00',
          endTime: '23:59',
          ...body,
        });
    const own = (await session({ kind: 'CLASS', classGradeId: mezmurGrade.id }, taker).expect(201))
      .body.data;
    expect(own.ownerDepartmentId).toBe(mezmur.id);
    await session({ kind: 'CLASS', classGradeId: educationGrade.id }, taker).expect(403);
    const foreign = (
      await session({ kind: 'CLASS', classGradeId: educationGrade.id }, admin).expect(201)
    ).body.data;
    await request(http).get(`/api/v1/attendance/sessions/${foreign.id}`).set(as(taker)).expect(403);
    const listed = (
      await request(http).get('/api/v1/attendance/sessions?pageSize=100').set(as(taker)).expect(200)
    ).body.data;
    expect(listed.some((s: { id: number }) => s.id === foreign.id)).toBe(false);
    expect(listed.some((s: { id: number }) => s.id === own.id)).toBe(true);
    // An OTHER session by a single-department user is organised by that department.
    const other = (await session({ kind: 'OTHER' }, taker).expect(201)).body.data;
    expect(other.organiserId).toBe(mezmur.id);
    await session({ kind: 'OTHER', organiserId: education.id }, taker).expect(403);

    await request(http)
      .post(`/api/v1/attendance/sessions/${own.id}/scan`)
      .set(as(taker))
      .send({ code: member.memberCode })
      .expect(200);
    await request(http)
      .post(`/api/v1/attendance/sessions/${own.id}/close`)
      .set(as(taker))
      .expect(200);
    // Other days are for department admins: a taker can't create or change them.
    await session({ kind: 'CLASS', classGradeId: mezmurGrade.id, date: '2026-01-04' }, taker)
      .expect(403)
      .expect((r) => expect(r.body.details ?? r.body).toBeDefined());
    const past = (
      await session(
        { kind: 'CLASS', classGradeId: mezmurGrade.id, date: '2026-01-04' },
        deptAdmin,
      ).expect(201)
    ).body.data;
    await request(http)
      .post(`/api/v1/attendance/sessions/${past.id}/scan`)
      .set(as(taker))
      .send({ code: member.memberCode })
      .expect(403);
    await request(http)
      .post(`/api/v1/attendance/sessions/${past.id}/close`)
      .set(as(taker))
      .expect(403);
    await request(http)
      .post(`/api/v1/attendance/sessions/${past.id}/close`)
      .set(as(deptAdmin))
      .expect(200);
    await request(http)
      .delete(`/api/v1/attendance/sessions/${past.id}`)
      .set(as(deptAdmin))
      .expect(204);

    // Takers have full control of their own attendance, including deleting, but not others'.
    await request(http)
      .delete(`/api/v1/attendance/sessions/${foreign.id}`)
      .set(as(taker))
      .expect(403);
    await request(http).delete(`/api/v1/attendance/sessions/${own.id}`).set(as(taker)).expect(204);
    await request(http)
      .delete(`/api/v1/attendance/sessions/${foreign.id}`)
      .set(as(deptAdmin))
      .expect(403);
    await request(http)
      .delete(`/api/v1/attendance/sessions/${foreign.id}`)
      .set(as(admin))
      .expect(204);

    // Every page shows only the department's own world.
    const educationOnly = (
      await request(http)
        .post('/api/v1/members')
        .set(as(admin))
        .send({
          firstName: 'Outside',
          fatherName: 'Scope',
          grandfatherName: `G${RUN}`,
          gender: 'FEMALE',
          dateOfBirth: '2011-01-01',
          classGradeIds: [educationGrade.id],
        })
        .expect(201)
    ).body.data;
    const get = async (url: string, token = deptAdmin) =>
      (await request(http).get(`/api/v1${url}`).set(as(token)).expect(200)).body;
    expect((await get('/departments')).data.map((d: { id: number }) => d.id)).toEqual([mezmur.id]);
    await request(http).get(`/api/v1/departments/${education.id}`).set(as(deptAdmin)).expect(403);
    const types = (await get('/class-types', taker)).data as { departmentId: number }[];
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((t) => t.departmentId === mezmur.id)).toBe(true);
    const memberIds = (await get('/members?pageSize=100&search=Scope')).data.map(
      (m: { id: number }) => m.id,
    );
    expect(memberIds).toContain(member.id);
    expect(memberIds).not.toContain(educationOnly.id);
    await request(http).get(`/api/v1/members/${educationOnly.id}`).set(as(deptAdmin)).expect(404);
    // Takers only have the attendance page: no member, department or class pages…
    await request(http).get('/api/v1/members').set(as(taker)).expect(403);
    await request(http).get(`/api/v1/departments/${mezmur.id}`).set(as(taker)).expect(403);
    // Scanners don't see member lists: no roster, no low-attendance report.
    await request(http)
      .get(`/api/v1/attendance/sessions/${own.id}/roster`)
      .set(as(taker))
      .expect(403);
    await request(http).get('/api/v1/attendance/reports/low-attendance').set(as(taker)).expect(403);
    // …but can load what the session form needs.
    await get('/departments', taker);
    await get('/service-terms', taker);
    const stats = (await get('/members/stats')).data;
    expect(stats.total).toBe((await get('/members?pageSize=1')).meta.total);
    // Adding to the roster can still find anyone.
    const found = (await get(`/departments/${mezmur.id}/candidates?search=Outside%20Scope`)).data;
    expect(found.map((m: { id: number }) => m.id)).toContain(educationOnly.id);

    // Classes: the Mezmur admin manages the classes Mezmur runs, and nothing else.
    const mezmurType = mezmurGrade.classTypeId;
    const newGrade = (
      await request(http)
        .post(`/api/v1/class-types/${mezmurType}/grades`)
        .set(as(deptAdmin))
        .send({ code: `NEW${run}`, nameEn: 'New', nameAm: 'አዲስ' })
        .expect(201)
    ).body.data;
    await request(http)
      .patch(`/api/v1/class-grades/${newGrade.id}`)
      .set(as(deptAdmin))
      .send({ nameAm: 'ተቀይሯል' })
      .expect(200);
    await request(http)
      .delete(`/api/v1/class-grades/${newGrade.id}`)
      .set(as(deptAdmin))
      .expect(204);
    await request(http)
      .post(`/api/v1/class-types/${educationGrade.classTypeId}/grades`)
      .set(as(deptAdmin))
      .send({ code: `NO${run}`, nameEn: 'No', nameAm: 'አይ' })
      .expect(403);
    await request(http)
      .patch(`/api/v1/class-types/${mezmurType}`)
      .set(as(deptAdmin))
      .send({ departmentId: education.id })
      .expect(403);
    const newType = (body: object) =>
      request(http)
        .post('/api/v1/class-types')
        .set(as(deptAdmin))
        .send({ code: `E2E_T${run}`, nameEn: 'T', nameAm: 'T', ...body });
    await newType({ departmentId: education.id }).expect(403);
    const created = (await newType({ departmentId: mezmur.id }).expect(201)).body.data;
    await request(http).delete(`/api/v1/class-types/${created.id}`).set(as(deptAdmin)).expect(204);
    await request(http)
      .post(`/api/v1/class-types/${mezmurType}/grades`)
      .set(as(taker))
      .send({ code: 'X', nameEn: 'X', nameAm: 'X' })
      .expect(403);

    // Service groups: the Mezmur admin organises groups of Mezmur classes only; takers read them.
    const term = (
      await request(http)
        .post('/api/v1/service-terms')
        .set(as(deptAdmin))
        .send({
          nameEn: `T${run}`,
          nameAm: `T${run}`,
          startsOn: '2030-09-11',
          endsOn: '2031-09-10',
          isCurrent: false,
        })
        .expect(201)
    ).body.data;
    const group = (body: object, token: string) =>
      request(http)
        .post(`/api/v1/service-terms/${term.id}/groups`)
        .set(as(token))
        .send({ nameEn: 'G', nameAm: 'G', ...body });
    const mezmurGroup = (await group({ classGradeId: mezmurGrade.id }, deptAdmin).expect(201)).body
      .data;
    await group({ classGradeId: educationGrade.id }, deptAdmin).expect(403);
    await group({}, deptAdmin).expect(403);
    await group({ classGradeId: mezmurGrade.id }, taker).expect(403);
    await request(http)
      .put(`/api/v1/service-groups/${mezmurGroup.id}/members`)
      .set(as(deptAdmin))
      .send({ memberIds: [member.id] })
      .expect(200);
    const groups = (
      await request(http).get(`/api/v1/service-terms/${term.id}/groups`).set(as(taker)).expect(200)
    ).body.data;
    expect(groups[0].members.map((m: { id: number }) => m.id)).toEqual([member.id]);
    // The taker runs the group's attendance, since the group's class belongs to Mezmur.
    await session({ kind: 'SERVICE_GROUP', serviceGroupId: mezmurGroup.id }, taker).expect(201);

    // Audit: the department admin sees their own actions and their takers'; takers have none.
    const adminId = (await get('/auth/me', admin)).data.id as number;
    const auditUsers = (await get('/audit/users')).data.map((u: { id: number }) => u.id);
    const audit = (await get('/audit?pageSize=100')).data as {
      user: { id: number };
      entity: string;
    }[];
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((e) => auditUsers.includes(e.user.id))).toBe(true);
    expect(audit.some((e) => e.user.id === takerUser.id && e.entity === 'AttendanceSession')).toBe(
      true,
    );
    // Themselves and the takers under them (earlier runs' Mezmur takers count too) — never the office admin.
    expect(auditUsers).toEqual(expect.arrayContaining([deptAdminUser.id, takerUser.id]));
    expect(auditUsers).not.toContain(adminId);
    await request(http).get('/api/v1/audit').set(as(taker)).expect(403);
    const officeView = (await get(`/audit?userId=${takerUser.id}`, admin)).data;
    expect(officeView.length).toBeGreaterThan(0);

    // Deactivated users can't sign in; admins can't lock themselves out.
    await request(http)
      .patch(`/api/v1/users/${takerUser.id}`)
      .set(as(deptAdmin))
      .send({ isActive: false })
      .expect(200);
    await request(http)
      .post('/api/v1/auth/login')
      .send({ email: `taker${run}@test.local`, password })
      .expect(401);
    await request(http)
      .patch(`/api/v1/users/${adminId}`)
      .set(as(admin))
      .send({ isActive: false })
      .expect(403);
  });
});
