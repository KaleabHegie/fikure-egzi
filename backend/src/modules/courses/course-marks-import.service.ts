import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { formatEcDate } from '../../common/utils/ethiopian-calendar.js';
import { cellText, loadWorkbook, rangeValidations, styleHeader } from '../../common/utils/excel.js';
import { normalizeMemberCode } from '../attendance/attendance-math.js';
import { CoursesService } from './courses.service.js';

export type Lang = 'am' | 'en';
const SHEET_MARKER = 'fikure-egzi-course-marks';
/** Blank rows under the students, for members who joined the grade later. */
const EXTRA_ROWS = 40;

export type MarkIssueCode =
  'required' | 'unknownMember' | 'duplicateMember' | 'notStudent' | 'invalidNumber' | 'overMax';

export interface MarkIssue {
  /** 'code', or the assessment's name. */
  column: string;
  code: MarkIssueCode;
  params?: Record<string, string | number>;
}

export interface MarkRowIssues {
  row: number;
  errors: MarkIssue[];
}

type Score = { assessmentId: number; memberId: number; score: number };

const MARK = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * A run's mark sheet in Excel: one row per student, one column per assessment.
 * Blank cells leave marks unchanged; nothing is saved while any row has an error.
 */
@Injectable()
export class CourseMarksImportService {
  constructor(private readonly courses: CoursesService) {}

  async buildSheet(runId: number, lang: Lang, actor: AuthenticatedUser): Promise<Buffer> {
    await this.courses.assertMarker(runId, actor);
    const { offering, students } = await this.courses.gradebook(runId, actor);
    const am = lang === 'am';
    const courseName = am ? offering.course.nameAm : offering.course.nameEn;
    const gradeName = am
      ? `${offering.classGrade.classType.nameAm} · ${offering.classGrade.nameAm}`
      : `${offering.classGrade.classType.nameEn} · ${offering.classGrade.nameEn}`;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fikure Egzi Sunday School';
    const sheet = wb.addWorksheet(am ? 'ውጤቶች' : 'Marks', {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    });
    const meta = wb.addWorksheet('Meta', { state: 'veryHidden' });
    meta.getCell('A1').value = SHEET_MARKER;
    meta.getCell('A2').value = runId;
    // Columns map to assessments by id, so renaming one in the app keeps old sheets valid.
    meta.getCell('A3').value = offering.assessments.map((a) => a.id).join(',');

    sheet.columns = [
      { key: 'code', width: 14, header: am ? 'መለያ ቁጥር *' : 'Member ID *' },
      { key: 'name', width: 34, header: am ? 'ስም' : 'Name' },
      ...offering.assessments.map((a) => ({
        key: `a${a.id}`,
        width: Math.max(12, a.name.length + 8),
        header: `${a.name} (/${a.maxScore})`,
      })),
    ];
    styleHeader(sheet.getRow(1), (col) => col === 1);
    for (const s of students) {
      sheet.addRow({
        code: s.member.memberCode,
        name: [s.member.firstName, s.member.fatherName, s.member.grandfatherName]
          .filter(Boolean)
          .join(' '),
        ...Object.fromEntries(offering.assessments.map((a) => [`a${a.id}`, s.marks[a.id] ?? null])),
      });
    }
    const last = students.length + EXTRA_ROWS + 1;
    offering.assessments.forEach((a, i) => {
      const col = sheet.getColumn(i + 3).letter;
      rangeValidations(sheet).add(`${col}2:${col}${last}`, {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, a.maxScore],
        showErrorMessage: true,
        errorTitle: a.name,
        error: am ? `ከ0 እስከ ${a.maxScore} ያለ ቁጥር ያስገቡ` : `Enter a number from 0 to ${a.maxScore}`,
      });
    });

    const help = wb.addWorksheet(am ? 'መመሪያ' : 'Instructions');
    const period = `${formatEcDate(iso(offering.startDate))} – ${formatEcDate(iso(offering.endDate))}`;
    const lines = am
      ? [
          `${courseName} — ${gradeName} (${period})`,
          '',
          '1. ለእያንዳንዱ ተማሪ በየምዘናው ስር ውጤቱን ይጻፉ (ከ0 እስከ ከፍተኛው ነጥብ)።',
          '2. ባዶ የተተወ ሕዋስ አይቀየርም፤ ያለውን ውጤት ለማጥፋት በድረ-ገጹ ላይ ያጥፉት።',
          '3. በዝርዝሩ ውስጥ ያልተካተተ የክፍሉ አባል ካለ መለያ ቁጥሩን ከታች ባሉት ባዶ ረድፎች ይጻፉ።',
          '4. ፋይሉን በዙሩ ገጽ ላይ ይጫኑ፤ ስህተት ካለ ምንም አይቀመጥም።',
        ]
      : [
          `${courseName} — ${gradeName} (${period})`,
          '',
          "1. Write each student's mark under each assessment (0 up to its maximum).",
          '2. Blank cells are not changed; to remove a mark, clear it on the website.',
          "3. For a member of the grade who isn't listed, write their member ID in the blank rows below.",
          '4. Upload the file on the run page; if any row has an error, nothing is saved.',
        ];
    lines.forEach((line, i) => {
      help.getCell(i + 1, 1).value = line;
      if (i === 0) help.getCell(1, 1).font = { bold: true, size: 13 };
    });
    help.getColumn(1).width = 100;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Checks a filled-in sheet; nothing is saved. */
  async preview(runId: number, file: Buffer, actor: AuthenticatedUser) {
    const { scores, students, issues, totalRows } = await this.parse(runId, file, actor);
    return {
      totalRows,
      students,
      toSave: scores.length,
      errorRows: issues.length,
      rows: issues.slice(0, 1000),
    };
  }

  /** Saves the sheet's marks in one go; if any row is invalid nothing is written. */
  async commit(runId: number, file: Buffer, actor: AuthenticatedUser) {
    const { scores, issues } = await this.parse(runId, file, actor);
    if (issues.length > 0) {
      throw new UnprocessableEntityException('Some rows have errors. Nothing was saved.');
    }
    if (scores.length > 0) await this.courses.setScores(runId, { scores }, actor);
    return { saved: scores.length };
  }

  private async parse(runId: number, file: Buffer, actor: AuthenticatedUser) {
    await this.courses.assertMarker(runId, actor);
    const wb = await loadWorkbook(file);
    if (!wb) throw new UnprocessableEntityException('Upload the .xlsx sheet (Excel workbook).');
    const meta = wb.getWorksheet('Meta');
    if (meta?.getCell('A1').value !== SHEET_MARKER) {
      throw new UnprocessableEntityException(
        "This is not a course mark sheet. Download the run's sheet and fill it in.",
      );
    }
    if (Number(meta.getCell('A2').value) !== runId) {
      throw new UnprocessableEntityException('This sheet belongs to another course run.');
    }
    const sheet = wb.worksheets.find((w) => w.state === 'visible');
    if (!sheet) throw new UnprocessableEntityException('The mark sheet is missing.');

    const { offering, students } = await this.courses.gradebook(runId, actor);
    const byId = new Map(offering.assessments.map((a) => [a.id, a]));
    const columns = String(cellText(meta.getCell('A3').value).text || '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    if (columns.some((id) => !byId.has(id))) {
      throw new UnprocessableEntityException(
        'The assessments changed since this sheet was downloaded. Download it again.',
      );
    }

    // Members of the grade plus former students with marks; anyone else can't be marked.
    const allowed = new Map(students.map((s) => [s.member.memberCode, s.member.id]));
    const scores: Score[] = [];
    const issues: MarkRowIssues[] = [];
    const seen = new Map<number, number>();
    const marked = new Set<number>();
    let totalRows = 0;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const code = cellText(row.getCell(1).value).text;
      const cells = columns.map((_, i) => cellText(row.getCell(i + 3).value));
      if (!code && cells.every((c) => !c.text)) continue;
      totalRows++;
      const errors: MarkIssue[] = [];
      const memberId = code ? allowed.get(normalizeMemberCode(code)) : undefined;
      if (!code) errors.push({ column: 'code', code: 'required' });
      else if (memberId === undefined) {
        errors.push({ column: 'code', code: 'notStudent', params: { value: code } });
      } else if (seen.has(memberId)) {
        errors.push({
          column: 'code',
          code: 'duplicateMember',
          params: { row: seen.get(memberId)! },
        });
      } else seen.set(memberId, r);

      const rowScores: Score[] = [];
      cells.forEach((c, i) => {
        if (!c.text) return;
        const a = byId.get(columns[i]!)!;
        const text = c.text.replace(',', '.');
        if (!MARK.test(text)) {
          errors.push({ column: a.name, code: 'invalidNumber', params: { value: c.text } });
        } else if (Number(text) > a.maxScore) {
          errors.push({ column: a.name, code: 'overMax', params: { max: a.maxScore } });
        } else if (memberId !== undefined) {
          rowScores.push({ assessmentId: a.id, memberId, score: Number(text) });
        }
      });
      if (errors.length > 0) issues.push({ row: r, errors });
      else if (rowScores.length > 0) {
        scores.push(...rowScores);
        marked.add(memberId!);
      }
    }
    return { scores, students: marked.size, issues, totalRows };
  }
}

const iso = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
