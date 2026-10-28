import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const RUN = Date.now().toString(36);

describe('Courses (e2e)', () => {
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

  it('education admin registers teachers and courses; teachers set assessments and marks', async () => {
    const education = await prisma.department.findUniqueOrThrow({ where: { code: 'EDUCATION' } });
    const mezmur = await prisma.department.findUniqueOrThrow({ where: { code: 'MEZMUR' } });
    const type = await prisma.classType.upsert({
      where: { code: 'E2E_COURSES' },
      update: {},
      create: {
        code: 'E2E_COURSES',
        nameEn: 'Course test',
        nameAm: 'የኮርስ ሙከራ',
        isActive: false,
        departmentId: education.id,
      },
    });
    const grade = await prisma.classGrade.create({
      data: {
        classTypeId: type.id,
        code: `CRS${Date.now() % 1e6}`,
        nameEn: 'G',
        nameAm: 'ክ',
        sortOrder: 99,
      },
    });
    const member = async (firstName: string, inGrade: boolean) => {
      const id = (
        await request(http)
          .post('/api/v1/members')
          .set(as(admin))
          .send({
            firstName,
            fatherName: 'Course',
            grandfatherName: `G${RUN}`,
            gender: 'MALE',
            dateOfBirth: '2010-01-01',
          })
          .expect(201)
      ).body.data.id as number;
      if (inGrade) {
        await prisma.memberClassEnrollment.create({
          data: { memberId: id, classTypeId: type.id, classGradeId: grade.id },
        });
      }
      return id;
    };
    const [teacherMember, otherTeacherMember, abel, bethel, outsider] = [
      await member('Teacher', false),
      await member('Other', false),
      await member('Abel', true),
      await member('Bethel', true),
      await member('Outsider', false),
    ];

    // The education department admin registers a teacher, linked to a member.
    const password = 'Str0ng-pass!';
    await request(http)
      .post('/api/v1/users')
      .set(as(admin))
      .send({
        fullName: 'Education Admin',
        email: `edu${RUN}@test.local`,
        password,
        roleCode: 'DEPARTMENT_ADMIN',
        departmentIds: [education.id],
      })
      .expect(201);
    const edu = await login(`edu${RUN}@test.local`, password);
    const newTeacher = (email: string, memberId?: number) =>
      request(http)
        .post('/api/v1/users')
        .set(as(edu))
        .send({
          fullName: 'Memhir',
          email,
          password,
          roleCode: 'TEACHER',
          departmentIds: [education.id],
          memberId,
        });
    await newTeacher(`t0${RUN}@test.local`).expect(422); // needs a member
    const teacher = (await newTeacher(`t1${RUN}@test.local`, teacherMember).expect(201)).body.data;
    expect(teacher).toMatchObject({ role: { code: 'TEACHER' }, member: { id: teacherMember } });
    await newTeacher(`t2${RUN}@test.local`, teacherMember).expect(422); // one login per member
    const other = (await newTeacher(`t3${RUN}@test.local`, otherTeacherMember).expect(201)).body
      .data;

    // Courses belong to the admin's departments and carry a duration.
    await request(http)
      .post('/api/v1/courses')
      .set(as(edu))
      .send({ nameAm: 'ሌላ', nameEn: 'Other', duration: 'ONE_YEAR', departmentId: mezmur.id })
      .expect(403);
    const course = (
      await request(http)
        .post('/api/v1/courses')
        .set(as(edu))
        .send({
          nameAm: `ትምህርተ ሃይማኖት ${RUN}`,
          nameEn: `Doctrine ${RUN}`,
          duration: 'THREE_MONTHS',
          departmentId: education.id,
          passMark: 60,
        })
        .expect(201)
    ).body.data;
    expect(course).toMatchObject({
      courseCode: expect.stringMatching(/^CRS-\d{5}$/),
      passMark: 60,
    });

    // A run: the end date defaults from the duration (3 Ethiopian months = 90 days).
    const runRes = await request(http)
      .post('/api/v1/course-runs')
      .set(as(edu))
      .send({
        courseId: course.id,
        classGradeId: grade.id,
        startDate: '2026-09-11',
        teacherIds: [teacher.id],
      })
      .expect(201);
    const run = runRes.body.data;
    expect(run.endDate.slice(0, 10)).toBe('2026-12-09');
    expect(run.teachers.map((t: { id: number }) => t.id)).toEqual([teacher.id]);
    // Only classes of the course's department can take it.
    const mezmurType = await prisma.classType.upsert({
      where: { code: 'E2E_COURSES_MEZMUR' },
      update: {},
      create: {
        code: 'E2E_COURSES_MEZMUR',
        nameEn: 'Mezmur course test',
        nameAm: 'የመዝሙር ሙከራ',
        isActive: false,
        departmentId: mezmur.id,
      },
    });
    const mezmurGrade = await prisma.classGrade.create({
      data: { classTypeId: mezmurType.id, code: `MZ${Date.now() % 1e6}`, nameEn: 'M', nameAm: 'መ' },
    });
    await request(http)
      .post('/api/v1/course-runs')
      .set(as(admin))
      .send({
        courseId: course.id,
        classGradeId: mezmurGrade.id,
        startDate: '2030-01-01',
        teacherIds: [teacher.id],
      })
      .expect(422);
    // The same course can't run twice for a grade at once.
    await request(http)
      .post('/api/v1/course-runs')
      .set(as(edu))
      .send({
        courseId: course.id,
        classGradeId: grade.id,
        startDate: '2026-10-01',
        teacherIds: [other.id],
      })
      .expect(422);
    // Next term: a different teacher.
    const nextRun = (
      await request(http)
        .post('/api/v1/course-runs')
        .set(as(edu))
        .send({
          courseId: course.id,
          classGradeId: grade.id,
          startDate: '2027-01-01',
          teacherIds: [other.id],
        })
        .expect(201)
    ).body.data;

    // The teacher sees only their own runs and can't schedule.
    const t = await login(`t1${RUN}@test.local`, password);
    const mine = (await request(http).get('/api/v1/course-runs').set(as(t)).expect(200)).body.data;
    expect(mine.map((r: { id: number }) => r.id)).toEqual([run.id]);
    await request(http).get(`/api/v1/course-runs/${nextRun.id}`).set(as(t)).expect(404);
    await request(http)
      .post('/api/v1/course-runs')
      .set(as(t))
      .send({
        courseId: course.id,
        classGradeId: grade.id,
        startDate: '2028-01-01',
        teacherIds: [teacher.id],
      })
      .expect(403);

    // Assessments: maxima add up to at most 100.
    const assess = (list: { id?: number; name: string; maxScore: number }[]) =>
      request(http)
        .put(`/api/v1/course-runs/${run.id}/assessments`)
        .set(as(t))
        .send({ assessments: list });
    await assess([
      { name: 'Quiz', maxScore: 50 },
      { name: 'Final', maxScore: 60 },
    ]).expect(422);
    const set = (
      await assess([
        { name: 'Quiz', maxScore: 20 },
        { name: 'Mid', maxScore: 30 },
        { name: 'Final', maxScore: 50 },
      ]).expect(200)
    ).body.data;
    expect(set.totalMax).toBe(100);
    const [quiz, mid, final] = set.assessments as { id: number }[];

    // Marks: within the maximum, for students of the grade only.
    const marks = (scores: { assessmentId: number; memberId: number; score: number | null }[]) =>
      request(http).put(`/api/v1/course-runs/${run.id}/marks`).set(as(t)).send({ scores });
    await marks([{ assessmentId: quiz!.id, memberId: abel, score: 25 }]).expect(422);
    await marks([{ assessmentId: quiz!.id, memberId: outsider, score: 10 }]).expect(422);
    const book = (
      await marks([
        { assessmentId: quiz!.id, memberId: abel, score: 18 },
        { assessmentId: mid!.id, memberId: abel, score: 25 },
        { assessmentId: final!.id, memberId: abel, score: 40 },
        { assessmentId: quiz!.id, memberId: bethel, score: 10 },
        { assessmentId: mid!.id, memberId: bethel, score: 12.5 },
        { assessmentId: final!.id, memberId: bethel, score: 20 },
      ]).expect(200)
    ).body.data;
    const row = (id: number) =>
      book.students.find((s: { member: { id: number } }) => s.member.id === id);
    expect(book.students).toHaveLength(2);
    expect(row(abel)).toMatchObject({ total: 83, result: 'PASS' });
    expect(row(bethel)).toMatchObject({ total: 42.5, result: 'FAIL' });

    // Clearing a mark makes the result pending again.
    const cleared = (
      await marks([{ assessmentId: final!.id, memberId: bethel, score: null }]).expect(200)
    ).body.data;
    expect(
      cleared.students.find((s: { member: { id: number } }) => s.member.id === bethel),
    ).toMatchObject({
      total: 22.5,
      result: null,
    });

    // A maximum can't drop below marks already given.
    await assess([
      { id: quiz!.id, name: 'Quiz', maxScore: 10 },
      { id: mid!.id, name: 'Mid', maxScore: 30 },
      { id: final!.id, name: 'Final', maxScore: 50 },
    ]).expect(422);

    // The other teacher can't mark this run; the member's results are on record.
    const o = await login(`t3${RUN}@test.local`, password);
    await request(http)
      .put(`/api/v1/course-runs/${run.id}/marks`)
      .set(as(o))
      .send({ scores: [{ assessmentId: quiz!.id, memberId: abel, score: 1 }] })
      .expect(404);
    const results = (
      await request(http).get(`/api/v1/courses/member/${abel}`).set(as(admin)).expect(200)
    ).body.data;
    expect(results.taking.find((r: { id: number }) => r.id === run.id)).toMatchObject({
      total: 83,
      result: 'PASS',
      course: { id: course.id },
    });
    // The teacher's member record lists the runs they teach now (not finished ones).
    const teacherCourses = (
      await request(http).get(`/api/v1/courses/member/${teacherMember}`).set(as(admin)).expect(200)
    ).body.data;
    expect(teacherCourses.teaching.map((r: { id: number }) => r.id)).toContain(run.id);

    // Marks can also come from the run's Excel sheet: blank cells keep marks, bad cells block the save.
    const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };
    const sheetRes = await request(http)
      .get(`/api/v1/course-runs/${run.id}/marks/sheet?lang=en`)
      .set(as(t))
      .buffer(true)
      .parse(binary)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(sheetRes.body as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Marks')!;
    expect(ws.getRow(1).getCell(3).value).toBe('Quiz (/20)');
    const abelCode = (await prisma.member.findUniqueOrThrow({ where: { id: abel } })).memberCode;
    let abelRow = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === abelCode) abelRow = n;
    });
    expect(ws.getRow(abelRow).getCell(4).value).toBe(25);
    const upload = async (edit: (sheet: ExcelJS.Worksheet) => void) => {
      edit(ws);
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const bad = await upload((sheet) => {
      sheet.getRow(abelRow).getCell(4).value = 26;
      sheet.getRow(abelRow + 1).getCell(5).value = 999;
    });
    const badPreview = (
      await request(http)
        .post(`/api/v1/course-runs/${run.id}/marks/sheet/preview`)
        .set(as(t))
        .attach('file', bad, 'marks.xlsx')
        .expect(200)
    ).body.data;
    expect(badPreview.errorRows).toBe(1);
    await request(http)
      .put(`/api/v1/course-runs/${run.id}/marks/sheet`)
      .set(as(t))
      .attach('file', bad, 'marks.xlsx')
      .expect(422);
    const good = await upload((sheet) => {
      sheet.getRow(abelRow + 1).getCell(5).value = null;
    });
    const saved = (
      await request(http)
        .put(`/api/v1/course-runs/${run.id}/marks/sheet`)
        .set(as(t))
        .attach('file', good, 'marks.xlsx')
        .expect(200)
    ).body.data;
    expect(saved.saved).toBeGreaterThan(0);
    const afterImport = (
      await request(http).get(`/api/v1/course-runs/${run.id}/marks`).set(as(t)).expect(200)
    ).body.data;
    expect(
      afterImport.students.find((s: { member: { id: number } }) => s.member.id === abel),
    ).toMatchObject({ total: 84, result: 'PASS' });
    // Another teacher can't download this run's sheet.
    await request(http).get(`/api/v1/course-runs/${run.id}/marks/sheet`).set(as(o)).expect(404);

    // Once a run is closed, teachers retain read access but only the department admin can amend it.
    await prisma.courseOffering.update({
      where: { id: run.id },
      data: { endDate: new Date('2020-01-01') },
    });
    await request(http).get(`/api/v1/course-runs/${run.id}/marks`).set(as(t)).expect(200);
    await marks([{ assessmentId: quiz!.id, memberId: abel, score: 19 }]).expect(403);
    await request(http)
      .put(`/api/v1/course-runs/${run.id}/marks`)
      .set(as(edu))
      .send({ scores: [{ assessmentId: quiz!.id, memberId: abel, score: 19 }] })
      .expect(200);

    // A course with runs can't be deleted.
    await request(http).delete(`/api/v1/courses/${course.id}`).set(as(edu)).expect(422);
  });
});
