import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { formatEcDate } from '../src/common/utils/ethiopian-calendar.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Unique per run: member full names must be unique and the test database is reused. */
const RUN = Date.now().toString(36);

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Attendance Excel import (e2e)', () => {
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

  const workbook = async (path: string) => {
    const res = await request(http).get(path).set(auth()).buffer(true).parse(binary).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    return wb;
  };
  const send = (method: 'post' | 'put', path: string, wb: ExcelJS.Workbook) =>
    wb.xlsx
      .writeBuffer()
      .then((buf) =>
        request(http)[method](path).set(auth()).attach('file', Buffer.from(buf), 'a.xlsx'),
      );

  let setups = 0;
  async function setup() {
    const tag = `${RUN}${(setups += 1)}`;
    const type = await prisma.classType.upsert({
      where: { code: 'E2E_IMPORT' },
      update: { isActive: true },
      create: {
        code: 'E2E_IMPORT',
        nameEn: 'Import test',
        nameAm: 'የማስገቢያ ሙከራ',
        department: { connect: { code: 'OFFICE' } },
      },
    });
    const grade = await prisma.classGrade.create({
      data: {
        classTypeId: type.id,
        code: `IMP${tag}`,
        nameEn: `G${tag}`,
        nameAm: `G${tag}`,
        sortOrder: 99,
      },
    });
    const member = async (firstName: string, classGradeIds: number[]) =>
      (
        await request(http)
          .post('/api/v1/members')
          .set(auth())
          .send({
            firstName,
            fatherName: 'Import',
            grandfatherName: `G${tag}`,
            gender: 'FEMALE',
            dateOfBirth: '2010-01-01',
            classGradeIds,
          })
          .expect(201)
      ).body.data as { id: number; memberCode: string };
    return {
      tag,
      grade,
      a: await member('Alem', [grade.id]),
      b: await member('Birtukan', [grade.id]),
      outsider: await member('Outsider', []),
    };
  }

  it('fills a session from its Excel sheet', async () => {
    const { grade, a, b } = await setup();
    const session = (
      await request(http)
        .post('/api/v1/attendance/sessions')
        .set(auth())
        .send({
          kind: 'CLASS',
          title: 'Sheet',
          date: '2025-02-02',
          startTime: '08:00',
          endTime: '10:00',
          classGradeId: grade.id,
        })
        .expect(201)
    ).body.data;

    const wb = await workbook(`/api/v1/attendance/sessions/${session.id}/sheet?lang=am`);
    const sheet = wb.getWorksheet('አቴንዳንስ')!;
    const rowOf = (code: string) => {
      for (let r = 2; r <= sheet.rowCount; r++) if (sheet.getCell(r, 1).value === code) return r;
      throw new Error(`${code} not in sheet`);
    };
    // The roster is listed; statuses are picked in Amharic.
    sheet.getCell(rowOf(a.memberCode), 3).value = 'ተገኝቷል';
    sheet.getCell(rowOf(b.memberCode), 3).value = 'ቀርቷል';
    sheet.getCell(rowOf(b.memberCode), 4).value = 'Travelling';
    const extra = sheet.rowCount + 1;
    sheet.getCell(extra, 1).value = 'FE-99999';
    sheet.getCell(extra, 3).value = 'ተገኝቷል';

    const preview = (
      await send('post', `/api/v1/attendance/sessions/${session.id}/sheet/preview`, wb)
    ).body.data;
    expect(preview).toMatchObject({ toSave: 2, errorRows: 1 });
    expect(preview.rows[0].errors[0]).toMatchObject({ column: 'code', code: 'unknownMember' });
    expect((await send('put', `/api/v1/attendance/sessions/${session.id}/sheet`, wb)).status).toBe(
      422,
    );

    sheet.getCell(extra, 1).value = null;
    sheet.getCell(extra, 3).value = null;
    const saved = (await send('put', `/api/v1/attendance/sessions/${session.id}/sheet`, wb)).body
      .data;
    expect(saved).toEqual({ saved: 2 });
    const after = (
      await request(http).get(`/api/v1/attendance/sessions/${session.id}`).set(auth()).expect(200)
    ).body.data;
    expect(after.counts).toMatchObject({ present: 1, absent: 1 });
  });

  it('creates many sessions from the session list template', async () => {
    const { tag, grade } = await setup();
    const wb = await workbook('/api/v1/attendance/import/template?lang=en');
    const sheet = wb.getWorksheet('Sessions')!;
    // Like the New session form: type, class, group, title, date, start, end, late after, place.
    expect((sheet.getRow(1).values as string[]).slice(1)).toEqual([
      'Type *',
      'Class',
      'Service group',
      'Title',
      'Date (E.C.) *',
      'Starts *',
      'Ends *',
      'Late after (min)',
      'Place',
    ]);
    const N = null;
    const classLabel = `Import test · G${tag}`;
    const rows: (string | number | null)[][] = [
      ['Class', classLabel, N, N, formatEcDate('2025-03-09'), '2:00 day', '5:00 day', 10, 'Hall'],
      ['Class', classLabel, N, N, formatEcDate('2025-03-16'), '2:00 day', '5:00 day', N, N],
      [
        'Other',
        N,
        N,
        `Gathering ${tag}`,
        formatEcDate('2025-03-16'),
        '1:00 night',
        '3:00 night',
        N,
        N,
      ],
      // Overlaps row 3: the same class at the same time.
      ['Class', classLabel, N, N, formatEcDate('2025-03-16'), '3:00 day', '6:00 day', N, N],
    ];
    rows.forEach((values, i) => values.forEach((v, j) => (sheet.getCell(i + 2, j + 1).value = v)));

    let preview = (await send('post', '/api/v1/attendance/import/preview?lang=en', wb)).body.data;
    expect(preview).toMatchObject({ totalRows: 4, errorRows: 1 });
    expect(preview.rows[0]).toMatchObject({
      row: 5,
      errors: [{ column: 'start', code: 'overlapInFile', params: { row: 3 } }],
    });

    sheet.spliceRows(5, 1);
    preview = (await send('post', '/api/v1/attendance/import/preview?lang=en', wb)).body.data;
    expect(preview.errorRows).toBe(0);
    expect(preview.sessions).toEqual([
      expect.objectContaining({
        kind: 'CLASS',
        title: classLabel,
        start: '08:00',
        end: '11:00',
        existing: false,
      }),
      expect.objectContaining({ kind: 'CLASS', date: '2025-03-16', existing: false }),
      expect.objectContaining({
        kind: 'OTHER',
        title: `Gathering ${tag}`,
        start: '19:00',
        end: '21:00',
      }),
    ]);

    const done = (await send('post', '/api/v1/attendance/import?lang=en', wb)).body.data;
    expect(done).toEqual({ created: 3, skipped: 0 });
    const first = await prisma.attendanceSession.findFirstOrThrow({
      where: { classGradeId: grade.id, startsAt: new Date('2025-03-09T08:00:00+03:00') },
    });
    expect(first).toMatchObject({
      status: 'OPEN',
      lateAfterMinutes: 10,
      location: 'Hall',
      autoClose: false,
    });

    // Uploading the same list again skips what already exists.
    const again = (await send('post', '/api/v1/attendance/import?lang=en', wb)).body.data;
    expect(again).toEqual({ created: 0, skipped: 3 });
  });
});
