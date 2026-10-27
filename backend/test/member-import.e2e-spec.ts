import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Collects a binary response body into a Buffer (supertest returns text otherwise). */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Member Excel import (e2e)', () => {
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

  async function template(lang: 'en' | 'am') {
    const res = await request(http)
      .get(`/api/v1/members/import/template?lang=${lang}`)
      .set(auth())
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    return wb;
  }

  const upload = (path: string, wb: ExcelJS.Workbook) =>
    wb.xlsx
      .writeBuffer()
      .then((buf) =>
        request(http).post(path).set(auth()).attach('file', Buffer.from(buf), 'members.xlsx'),
      );

  it('builds a template whose dropdowns list the current classes and departments', async () => {
    const wb = await template('am');
    const sheet = wb.getWorksheet('አባላት')!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    expect(headers).toEqual(
      expect.arrayContaining(['ስም *', 'የመዝሙር ክፍል', 'የኮርስ ክፍል', 'የአገልግሎት ክፍል']),
    );
    const lists = wb.getWorksheet('Lists')!;
    const allListValues = lists.getSheetValues().flat().filter(Boolean);
    expect(allListValues).toEqual(
      expect.arrayContaining(['ወንድ', 'ግዕዝ (ሐ)', '12ኛ ክፍል', 'ፅህፈት ቤት', 'ሰብሳቢ']),
    );
  });

  it('previews row problems, then imports a clean file in one go', async () => {
    const wb = await template('en');
    const sheet = wb.getWorksheet('Members')!;
    const keys = (wb.getWorksheet('Meta')!.getRow(3).values as string[]).slice(1);
    const types = await prisma.classType.findMany({ select: { id: true, code: true } });
    const mezmur = `class:${types.find((t) => t.code === 'MEZMUR')!.id}`;
    const course = `class:${types.find((t) => t.code === 'COURSE')!.id}`;
    const put = (row: number, values: Record<string, string | number>) => {
      for (const [k, v] of Object.entries(values))
        sheet.getCell(row, keys.indexOf(k) + 1).value = v;
    };
    const stamp = Date.now().toString(36);

    put(2, {
      firstName: `Imp${stamp}`,
      fatherName: 'Tesfaye',
      gender: 'Female',
      dateOfBirth: '11/01/2008',
      phone: 911223344,
      [mezmur]: "Ge'ez (ሐ)",
      [course]: 'Grade 3',
      department: 'Education',
      departmentRole: 'Secretary',
    });
    put(3, {
      firstName: `Imq${stamp}`,
      fatherName: 'Bekele',
      gender: 'ወንድ',
      dateOfBirth: '30/13/2010',
      phone: '12345',
      [course]: 'Grade 99',
    });
    put(4, {
      fatherName: 'NoFirstName',
      gender: 'Male',
      dateOfBirth: '01/01/2000',
      departmentRole: 'Head',
    });

    const preview = (await upload('/api/v1/members/import/preview', wb)).body.data;
    expect(preview).toMatchObject({ totalRows: 3, validRows: 1, errorRows: 2 });
    const codes = (row: number) =>
      preview.rows
        .find((r: { row: number }) => r.row === row)
        .errors.map((e: { column: string; code: string }) => `${e.column}:${e.code}`);
    expect(codes(3)).toEqual(
      expect.arrayContaining([
        'dateOfBirth:invalidDate',
        'phone:invalidPhone',
        `${course}:invalidOption`,
      ]),
    );
    expect(codes(4)).toEqual(
      expect.arrayContaining(['firstName:required', 'departmentRole:roleWithoutDepartment']),
    );

    // With errors present, nothing is written.
    const before = await prisma.member.count();
    expect((await upload('/api/v1/members/import', wb)).status).toBe(422);
    expect(await prisma.member.count()).toBe(before);

    // Clear the bad rows (blank rows are skipped) and import.
    for (const row of [3, 4]) keys.forEach((_k, i) => (sheet.getCell(row, i + 1).value = null));
    const result = await upload('/api/v1/members/import', wb);
    expect(result.status).toBe(201);
    expect(result.body.data).toEqual({ imported: 1 });

    const member = await prisma.member.findFirst({
      where: { firstName: `Imp${stamp}` },
      include: {
        classEnrollments: { include: { classGrade: true } },
        departmentRoles: { include: { department: true } },
      },
    });
    expect(member).toMatchObject({ phone: '0911223344', gender: 'FEMALE' });
    expect(member!.dateOfBirth!.toISOString().slice(0, 10)).toBe('2015-09-22'); // Meskerem 11, 2008 E.C. (2008 began on 12 Sep, after leap year 2007)
    expect(member!.classEnrollments.map((e) => e.classGrade.code).sort()).toEqual(['G03', 'GEEZ']);
    expect(member!.departmentRoles).toEqual([
      expect.objectContaining({
        role: 'SECRETARY',
        department: expect.objectContaining({ code: 'EDUCATION' }),
      }),
    ]);
    expect(await prisma.classPlacementHistory.count({ where: { memberId: member!.id } })).toBe(2);
    expect(await prisma.departmentServiceHistory.count({ where: { memberId: member!.id } })).toBe(
      1,
    );

    // Importing the same file again is refused: that full name is already registered.
    const again = (await upload('/api/v1/members/import/preview', wb)).body.data;
    expect(again.rows[0].errors).toEqual([
      expect.objectContaining({ code: 'duplicateName', params: { code: member!.memberCode } }),
    ]);
  });

  it('rejects files that are not the template', async () => {
    await request(http)
      .post('/api/v1/members/import/preview')
      .set(auth())
      .attach('file', Buffer.from('name,phone\nA,1'), 'members.csv')
      .expect(422);
  });
});
