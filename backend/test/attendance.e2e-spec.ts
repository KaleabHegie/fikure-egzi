import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

/** Addis Ababa wall-clock parts of `d` (UTC+3, no DST). */
const addis = (d: Date) => {
  const iso = new Date(d.getTime() + 3 * 3_600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

describe('Attendance (e2e)', () => {
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

  it('runs a class session: scan, late, outsider, excused, close, reports', async () => {
    // A throwaway grade so the roster is exactly our three members.
    // Its own class type, so other suites' counts of real classes are unaffected.
    const type = await prisma.classType.upsert({
      where: { code: 'E2E_ATTENDANCE' },
      update: {},
      create: {
        code: 'E2E_ATTENDANCE',
        nameEn: 'Attendance test',
        nameAm: 'የመገኘት ሙከራ',
        isActive: false,
        department: { connect: { code: 'OFFICE' } },
      },
    });
    const grade = await prisma.classGrade.create({
      data: {
        classTypeId: type.id,
        code: `ATT${Date.now() % 1e6}`,
        nameEn: 'Attendance test',
        nameAm: 'ሙከራ',
        sortOrder: 99,
      },
    });
    const newMember = async (firstName: string, classGradeIds: number[] = [grade.id]) =>
      (
        await request(http)
          .post('/api/v1/members')
          .set(auth())
          .send({
            firstName,
            fatherName: 'Attend',
            grandfatherName: `G${RUN}`,
            gender: 'FEMALE',
            dateOfBirth: '2010-01-01',
            classGradeIds,
          })
          .expect(201)
      ).body.data as { id: number; memberCode: string };
    const onTime = await newMember('Abeba');
    const excused = await newMember('Bethel');
    const absent = await newMember('Ruth');
    const visitor = await newMember('Visitor', []);

    // Started an hour ago with a 15-minute grace period: scans now are Late.
    const start = addis(new Date(Date.now() - 60 * 60_000));
    const end = addis(new Date(Date.now() + 60 * 60_000));
    // Sessions are single-day: near midnight, end at 23:59 rather than tomorrow.
    if (end.date !== start.date) end.time = '23:59';
    const session = (
      await request(http)
        .post('/api/v1/attendance/sessions')
        .set(auth())
        .send({
          kind: 'CLASS',
          title: 'Grade test',
          date: start.date,
          startTime: start.time,
          endTime: end.time,
          classGradeId: grade.id,
        })
        .expect(201)
    ).body.data;
    expect(session).toMatchObject({ rosterSize: 3, unmarked: 3, status: 'OPEN' });

    // A class session needs a grade.
    await request(http)
      .post('/api/v1/attendance/sessions')
      .set(auth())
      .send({ kind: 'CLASS', title: 'x', date: start.date, startTime: '08:00', endTime: '07:00' })
      .expect(422);

    const scan = (code: string) =>
      request(http)
        .post(`/api/v1/attendance/sessions/${session.id}/scan`)
        .set(auth())
        .send({ code });
    const first = (await scan(onTime.memberCode).expect(200)).body.data;
    expect(first).toMatchObject({
      alreadyRecorded: false,
      inRoster: true,
      record: { status: 'LATE', method: 'QR' },
    });
    // Scanning again changes nothing; a typed number works too.
    const digits = String(Number(onTime.memberCode.slice(3)));
    expect((await scan(digits).expect(200)).body.data.alreadyRecorded).toBe(true);
    // Someone outside the class is only reported, never recorded.
    expect((await scan(visitor.memberCode).expect(200)).body.data).toMatchObject({
      inRoster: false,
      record: null,
      alreadyRecorded: false,
    });
    // 3 expected, 1 marked → 2 unmarked.
    const midway = (
      await request(http).get(`/api/v1/attendance/sessions/${session.id}`).set(auth()).expect(200)
    ).body.data;
    expect(midway).toMatchObject({ rosterSize: 3, unmarked: 2 });
    await scan('FE-99999').expect(404);

    await request(http)
      .put(`/api/v1/attendance/sessions/${session.id}/records/${excused.id}`)
      .set(auth())
      .send({ status: 'EXCUSED', note: 'Sick' })
      .expect(200);

    const closed = (
      await request(http)
        .post(`/api/v1/attendance/sessions/${session.id}/close`)
        .set(auth())
        .expect(200)
    ).body.data;
    expect(closed).toMatchObject({
      status: 'CLOSED',
      rosterSize: 3,
      counts: { present: 0, late: 1, absent: 1, excused: 1 },
    });
    await scan(absent.memberCode).expect(409); // closed sessions can't be scanned

    const roster = (
      await request(http)
        .get(`/api/v1/attendance/sessions/${session.id}/roster`)
        .set(auth())
        .expect(200)
    ).body.data as {
      member: { id: number };
      inRoster: boolean;
      record: { status: string; note: string | null } | null;
    }[];
    const statusOf = (id: number) => roster.find((r) => r.member.id === id)?.record;
    expect(statusOf(absent.id)?.status).toBe('ABSENT');
    expect(statusOf(excused.id)).toMatchObject({ status: 'EXCUSED', note: 'Sick' });
    expect(roster.some((r) => r.member.id === visitor.id)).toBe(false);

    // Member summary: late arrival → ~60 minutes attended; excused doesn't count against the rate.
    const late = (
      await request(http).get(`/api/v1/members/${onTime.id}/attendance`).set(auth()).expect(200)
    ).body.data;
    expect(late).toMatchObject({ late: 1, rate: 100, sessions: 1 });
    // Every session in the period is listed, and the period can be narrowed.
    expect(late.records).toEqual([
      expect.objectContaining({ sessionId: session.id, status: 'LATE', title: 'Grade test' }),
    ]);
    const none = (
      await request(http)
        .get(`/api/v1/members/${onTime.id}/attendance?from=2000-01-01&to=2000-12-31`)
        .set(auth())
        .expect(200)
    ).body.data;
    expect(none).toMatchObject({ sessions: 0, records: [] });
    expect(late.minutesAttended).toBeGreaterThanOrEqual(59);
    expect(late.minutesAttended).toBeLessThanOrEqual(61);
    const ex = (
      await request(http).get(`/api/v1/members/${excused.id}/attendance`).set(auth()).expect(200)
    ).body.data;
    expect(ex).toMatchObject({ excused: 1, rate: null, minutesAttended: 0 });

    // Low-attendance report (minSessions 1 so a single session counts).
    const report = (
      await request(http)
        .get(
          `/api/v1/attendance/reports/low-attendance?classGradeId=${grade.id}&minSessions=1&threshold=50`,
        )
        .set(auth())
        .expect(200)
    ).body.data;
    expect(report.members.map((m: { member: { id: number } }) => m.member.id)).toEqual([absent.id]);

    // Reopen allows corrections again.
    await request(http)
      .post(`/api/v1/attendance/sessions/${session.id}/reopen`)
      .set(auth())
      .expect(200);
    expect((await scan(absent.memberCode).expect(200)).body.data.record.status).toBe('LATE');
  });

  it('closes regular sessions at their end time; gatherings only record Present', async () => {
    const type = await prisma.classType.upsert({
      where: { code: 'E2E_ATTENDANCE' },
      update: { isActive: true },
      create: {
        code: 'E2E_ATTENDANCE',
        nameEn: 'Attendance test',
        nameAm: 'የመገኘት ሙከራ',
        department: { connect: { code: 'OFFICE' } },
      },
    });
    const grade = await prisma.classGrade.create({
      data: {
        classTypeId: type.id,
        code: `AC${Date.now() % 1e6}`,
        nameEn: 'Auto',
        nameAm: 'Auto',
        sortOrder: 99,
      },
    });
    const member = (
      await request(http)
        .post('/api/v1/members')
        .set(auth())
        .send({
          firstName: 'Auto',
          fatherName: 'Close',
          grandfatherName: `G${RUN}`,
          gender: 'MALE',
          dateOfBirth: '2012-01-01',
          classGradeIds: [grade.id],
        })
        .expect(201)
    ).body.data as { id: number; memberCode: string };
    const other = await request(http)
      .post('/api/v1/members')
      .set(auth())
      .send({
        firstName: 'Second',
        fatherName: 'Close',
        grandfatherName: `G${RUN}`,
        gender: 'MALE',
        dateOfBirth: '2012-01-01',
        classGradeIds: [grade.id],
      })
      .expect(201);

    const start = addis(new Date(Date.now() - 60 * 60_000));
    const end = addis(new Date(Date.now() + 60 * 60_000));
    if (end.date !== start.date) end.time = '23:59';
    const create = (body: object) =>
      request(http)
        .post('/api/v1/attendance/sessions')
        .set(auth())
        .send({
          title: `Auto ${RUN}`,
          date: start.date,
          startTime: start.time,
          endTime: end.time,
          ...body,
        });

    // A class session started an hour ago: a scan now is Late; when its end passes it closes
    // itself and the unmarked member becomes Absent.
    const cls = (await create({ kind: 'CLASS', classGradeId: grade.id }).expect(201)).body.data;
    expect(cls.autoClose).toBe(true);
    // The same class can't have a second session at the same time.
    const twin = await create({ kind: 'CLASS', classGradeId: grade.id }).expect(422);
    expect(twin.body.details[0]).toMatchObject({ field: 'startTime' });
    const scanned = await request(http)
      .post(`/api/v1/attendance/sessions/${cls.id}/scan`)
      .set(auth())
      .send({ code: member.memberCode })
      .expect(200);
    expect(scanned.body.data.record.status).toBe('LATE');
    await prisma.attendanceSession.update({
      where: { id: cls.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const closed = (
      await request(http).get(`/api/v1/attendance/sessions/${cls.id}`).set(auth()).expect(200)
    ).body.data;
    expect(closed).toMatchObject({ status: 'CLOSED', counts: { late: 1, absent: 1 } });
    // Reopened for a correction, it stays open past its end time.
    await request(http)
      .post(`/api/v1/attendance/sessions/${cls.id}/reopen`)
      .set(auth())
      .expect(200);
    expect(
      (await request(http).get(`/api/v1/attendance/sessions/${cls.id}`).set(auth()).expect(200))
        .body.data.status,
    ).toBe('OPEN');
    expect(other.body.data.id).toBeGreaterThan(0);

    // A past session entered afterwards doesn't close itself.
    const past = (
      await create({
        kind: 'CLASS',
        classGradeId: grade.id,
        date: '2025-01-05',
        startTime: '08:00',
        endTime: '10:00',
      }).expect(201)
    ).body.data;
    expect(past).toMatchObject({ status: 'OPEN', autoClose: false });

    // A gathering: a late scan is still Present, only Present can be marked, and closing adds no Absent.
    const gathering = (await create({ kind: 'OTHER', classGradeId: grade.id }).expect(201)).body
      .data;
    const g = await request(http)
      .post(`/api/v1/attendance/sessions/${gathering.id}/scan`)
      .set(auth())
      .send({ code: member.memberCode })
      .expect(200);
    expect(g.body.data.record.status).toBe('PRESENT');
    await request(http)
      .put(`/api/v1/attendance/sessions/${gathering.id}/records/${other.body.data.id}`)
      .set(auth())
      .send({ status: 'ABSENT' })
      .expect(422);
    const gClosed = (
      await request(http)
        .post(`/api/v1/attendance/sessions/${gathering.id}/close`)
        .set(auth())
        .expect(200)
    ).body.data;
    expect(gClosed.counts).toMatchObject({ present: 1, absent: 0 });

    // Top attendance over the chosen sessions: the member came to both; the other to neither.
    const top = (
      await request(http)
        .get(`/api/v1/attendance/reports/top-attendance?sessionIds=${cls.id},${gathering.id}`)
        .set(auth())
        .expect(200)
    ).body.data;
    expect(top).toMatchObject({ totalSessions: 2, attendees: 1 });
    expect(top.members).toEqual([
      expect.objectContaining({
        rank: 1,
        attended: 2,
        late: 1,
        present: 1,
        member: expect.objectContaining({ id: member.id }),
      }),
    ]);
    await request(http)
      .get('/api/v1/attendance/reports/top-attendance?sessionIds=')
      .set(auth())
      .expect(422);
    await request(http)
      .get('/api/v1/attendance/reports/top-attendance?sessionIds=99999999')
      .set(auth())
      .expect(403);
  });
});
