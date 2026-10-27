import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ValidationFailedException } from '../../../common/filters/all-exceptions.filter.js';
import ExcelJS from 'exceljs';
import { type DepartmentScope, inScope } from '../../../common/auth/department-scope.js';
import { todayIso } from '../../../common/utils/dates.js';
import { formatEcDate, parseEcDate } from '../../../common/utils/ethiopian-calendar.js';
import { formatEthTime, parseEthTime } from '../../../common/utils/ethiopian-time.js';
import {
  cellText,
  type CellText,
  loadWorkbook,
  normalizeLabel,
  rangeValidations,
  styleHeader,
} from '../../../common/utils/excel.js';
import {
  AttendanceMethod,
  AttendanceSessionKind,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { addisDateTime, normalizeMemberCode } from '../attendance-math.js';
import {
  addisDateIso,
  AttendanceService,
  assertDay,
  isRegular,
  rosterWhere,
} from '../attendance.service.js';

export type Lang = 'am' | 'en';
const SHEET_MARKER = 'fikure-egzi-session-attendance';
const IMPORT_MARKER = 'fikure-egzi-attendance-import';
/** Sessions accepted per session-list file. */
export const MAX_SESSION_ROWS = 2000;
/** Blank rows under a session sheet's roster, for people who came but aren't on it. */
const EXTRA_ROWS = 60;

const STATUS_LABELS: Record<AttendanceStatus, Record<Lang, string>> = {
  PRESENT: { en: 'Present', am: 'ተገኝቷል' },
  LATE: { en: 'Late', am: 'አርፍዷል' },
  ABSENT: { en: 'Absent', am: 'ቀርቷል' },
  EXCUSED: { en: 'Excused', am: 'ፈቃድ' },
};
const KIND_LABELS: Record<AttendanceSessionKind, Record<Lang, string>> = {
  CLASS: { en: 'Class', am: 'ክፍል' },
  SERVICE_GROUP: { en: 'Service group', am: 'የአገልግሎት ምድብ' },
  OTHER: { en: 'Other', am: 'ሌላ' },
};

export type IssueCode =
  | 'required'
  | 'invalidOption'
  | 'invalidDate'
  | 'dateAsNumber'
  | 'futureDate'
  | 'invalidTime'
  | 'endBeforeStart'
  | 'unknownMember'
  | 'duplicateMember'
  | 'onlyPresent'
  | 'notYourDepartment'
  | 'invalidNumber'
  | 'tooLong'
  | 'overlap'
  | 'overlapInFile'
  | 'invalid';

export interface Issue {
  column: string;
  code: IssueCode;
  params?: Record<string, string | number>;
}

export interface RowIssues {
  row: number;
  errors: Issue[];
}

/** Every way a status may be written (code, English, Amharic) → status. */
const statusLookup = () => {
  const map = new Map<string, AttendanceStatus>();
  for (const [status, labels] of Object.entries(STATUS_LABELS)) {
    for (const alias of [status, labels.en, labels.am]) {
      map.set(normalizeLabel(alias), status as AttendanceStatus);
    }
  }
  return map;
};

/** Writes `values` into a hidden Lists column and returns the range for a dropdown. */
function listRange(lists: ExcelJS.Worksheet, col: number, values: string[]): string {
  values.forEach((v, i) => (lists.getCell(i + 1, col).value = v));
  const letter = lists.getColumn(col).letter;
  return `Lists!$${letter}$1:$${letter}$${Math.max(values.length, 1)}`;
}

function dropdown(
  sheet: ExcelJS.Worksheet,
  range: string,
  source: string,
  title: string,
  lang: Lang,
) {
  rangeValidations(sheet).add(range, {
    type: 'list',
    allowBlank: true,
    formulae: [source],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: title,
    error: lang === 'am' ? 'ከዝርዝሩ ውስጥ ይምረጡ።' : 'Choose a value from the list.',
  });
}

/** 96 quarter-hours on the Ethiopian clock, from day 1:00 (07:00) round the clock. */
const QUARTER_HOURS = Array.from({ length: 96 }, (_, i) => {
  const minutes = (7 * 60 + i * 15) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/**
 * Excel import for attendance:
 *  - a per-session sheet: the session's roster with a status dropdown, filled
 *    in (e.g. from a paper list) and uploaded back;
 *  - a multi-session file: one row per member per session, which creates the
 *    sessions, records attendance and closes them (for old paper records).
 */
@Injectable()
export class AttendanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  // ── Per-session sheet ────────────────────────────────────────────────────

  async buildSessionSheet(sessionId: number, lang: Lang, scope: DepartmentScope): Promise<Buffer> {
    const session = await this.attendance.findOne(sessionId, scope);
    const roster = await this.attendance.roster(sessionId, scope);
    const am = lang === 'am';
    const statuses = isRegular(session.kind)
      ? Object.values(AttendanceStatus)
      : [AttendanceStatus.PRESENT];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fikure Egzi Sunday School';
    const sheet = wb.addWorksheet(am ? 'አቴንዳንስ' : 'Attendance', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
    const meta = wb.addWorksheet('Meta', { state: 'veryHidden' });
    meta.getCell('A1').value = SHEET_MARKER;
    meta.getCell('A2').value = sessionId;

    sheet.columns = [
      { key: 'code', width: 14, header: am ? 'መለያ ቁጥር *' : 'Member ID *' },
      { key: 'name', width: 34, header: am ? 'ስም' : 'Name' },
      { key: 'status', width: 16, header: am ? 'ሁኔታ' : 'Status' },
      { key: 'note', width: 40, header: am ? 'ማስታወሻ' : 'Note' },
    ];
    styleHeader(sheet.getRow(1), (col) => col === 1);
    for (const r of roster) {
      sheet.addRow({
        code: r.member.memberCode,
        name: [r.member.firstName, r.member.fatherName, r.member.grandfatherName]
          .filter(Boolean)
          .join(' '),
        status: r.record ? STATUS_LABELS[r.record.status][lang] : '',
        note: r.record?.note ?? '',
      });
    }
    const last = roster.length + EXTRA_ROWS + 1;
    dropdown(
      sheet,
      `C2:C${last}`,
      listRange(
        lists,
        1,
        statuses.map((s) => STATUS_LABELS[s][lang]),
      ),
      am ? 'ሁኔታ' : 'Status',
      lang,
    );
    const help = wb.addWorksheet(am ? 'መመሪያ' : 'Instructions');
    const when = `${formatEcDate(addisDateIso(session.startsAt))} · ${formatEthTime(
      addisTime(session.startsAt),
      lang,
    )} – ${formatEthTime(addisTime(session.endsAt), lang)}`;
    const lines = am
      ? [
          `${session.title} — ${when}`,
          '',
          '1. ለእያንዳንዱ አባል "ሁኔታ" ከዝርዝሩ ይምረጡ። ባዶ የተተወ ረድፍ አይቀየርም።',
          '2. በዝርዝሩ ውስጥ የሌለ ሰው ከመጣ መለያ ቁጥሩን ከታች ባሉት ባዶ ረድፎች ይጻፉ።',
          isRegular(session.kind)
            ? '3. ክፍለ ጊዜው ሲዘጋ ምልክት ያልተደረገባቸው አባላት "ቀርቷል" ይሆናሉ።'
            : '3. ይህ ጉባኤ/ዝግጅት ስለሆነ "ተገኝቷል" ብቻ ይመዘገባል።',
          '4. ፋይሉን በክፍለ ጊዜው ገጽ ላይ ይጫኑ፤ ስህተት ካለ ምንም አይቀመጥም።',
        ]
      : [
          `${session.title} — ${when}`,
          '',
          '1. Pick a "Status" for each member. Rows left blank are not changed.',
          "2. For someone who came but isn't listed, write their member ID in the blank rows below.",
          isRegular(session.kind)
            ? '3. When the session closes, members with no mark become Absent.'
            : '3. This is a gathering/event: only Present is recorded.',
          '4. Upload the file on the session page; if any row has an error, nothing is saved.',
        ];
    lines.forEach((line, i) => {
      help.getCell(i + 1, 1).value = line;
      if (i === 0) help.getCell(1, 1).font = { bold: true, size: 13 };
    });
    help.getColumn(1).width = 100;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Checks a filled-in session sheet; nothing is saved. */
  async previewSessionSheet(sessionId: number, file: Buffer, scope: DepartmentScope) {
    const { rows, issues } = await this.parseSessionSheet(sessionId, file, scope);
    return {
      totalRows: rows.length + issues.length,
      toSave: rows.length,
      errorRows: issues.length,
      rows: issues.slice(0, 1000),
    };
  }

  /** Saves a session sheet in one go; if any row is invalid nothing is written. */
  async importSessionSheet(
    sessionId: number,
    file: Buffer,
    userId: number,
    scope: DepartmentScope,
    anyDay: boolean,
  ) {
    const session = await this.attendance.findOne(sessionId, scope);
    assertDay(addisDateIso(session.startsAt), anyDay);
    if (session.status !== AttendanceSessionStatus.OPEN) {
      throw new ConflictException({
        message: 'This session is closed. Reopen it to change attendance.',
        code: 'sessionClosed',
      });
    }
    const { rows, issues } = await this.parseSessionSheet(sessionId, file, scope);
    if (issues.length > 0) {
      throw new UnprocessableEntityException('Some rows have errors. Nothing was saved.');
    }
    const onRoster = new Set(
      (
        await this.prisma.member.findMany({
          where: { ...rosterWhere(session), id: { in: rows.map((r) => r.memberId) } },
          select: { id: true },
        })
      ).map((m) => m.id),
    );
    await this.prisma.$transaction(
      async (tx) => {
        for (const r of rows) {
          await tx.attendanceRecord.upsert({
            where: { sessionId_memberId: { sessionId, memberId: r.memberId } },
            create: {
              sessionId,
              memberId: r.memberId,
              status: r.status,
              note: r.note,
              method: AttendanceMethod.MANUAL,
              inRoster: onRoster.has(r.memberId),
              recordedById: userId,
            },
            update: { status: r.status, note: r.note, recordedById: userId },
          });
        }
        await this.audit.record(
          {
            userId,
            action: 'UPDATE',
            entity: 'AttendanceSession',
            entityId: sessionId,
            changes: { importedRecords: rows.length },
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );
    return { saved: rows.length };
  }

  private async parseSessionSheet(sessionId: number, file: Buffer, scope: DepartmentScope) {
    const session = await this.attendance.findOne(sessionId, scope);
    const wb = await loadWorkbook(file);
    if (!wb) throw new UnprocessableEntityException('Upload the .xlsx sheet (Excel workbook).');
    const meta = wb.getWorksheet('Meta');
    if (meta?.getCell('A1').value !== SHEET_MARKER) {
      throw new UnprocessableEntityException(
        "This is not a session attendance sheet. Download the session's sheet and fill it in.",
      );
    }
    if (Number(meta.getCell('A2').value) !== sessionId) {
      throw new UnprocessableEntityException('This sheet belongs to another session.');
    }
    const sheet = wb.worksheets.find(
      (w) => w.state === 'visible' && w.name !== 'Lists' && w.name !== 'Meta',
    );
    if (!sheet) throw new UnprocessableEntityException('The attendance sheet is missing.');

    const statuses = statusLookup();
    const raw: { row: number; code: string; status: CellText; note: string }[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const code = cellText(row.getCell(1).value).text;
      const status = cellText(row.getCell(3).value);
      const note = cellText(row.getCell(4).value).text;
      if (!code && !status.text && !note) continue;
      raw.push({ row: r, code, status, note });
    }
    const members = await this.membersByCode(raw.map((r) => r.code));

    const rows: { memberId: number; status: AttendanceStatus; note: string | null }[] = [];
    const issues: RowIssues[] = [];
    const seen = new Map<number, number>();
    for (const r of raw) {
      const errors: Issue[] = [];
      // A roster line left without a status is simply not changed.
      if (!r.status.text) {
        if (!r.code) errors.push({ column: 'code', code: 'required' });
        else if (r.note) errors.push({ column: 'status', code: 'required' });
        if (errors.length > 0) issues.push({ row: r.row, errors });
        continue;
      }
      const status = statuses.get(normalizeLabel(r.status.text));
      if (!status)
        errors.push({ column: 'status', code: 'invalidOption', params: { value: r.status.text } });
      else if (!isRegular(session.kind) && status !== AttendanceStatus.PRESENT) {
        errors.push({ column: 'status', code: 'onlyPresent' });
      }
      const memberId = r.code ? members.get(normalizeMemberCode(r.code)) : undefined;
      if (!r.code) errors.push({ column: 'code', code: 'required' });
      else if (!memberId)
        errors.push({ column: 'code', code: 'unknownMember', params: { value: r.code } });
      else if (seen.has(memberId)) {
        errors.push({
          column: 'code',
          code: 'duplicateMember',
          params: { row: seen.get(memberId)! },
        });
      } else seen.set(memberId, r.row);
      if (errors.length > 0) issues.push({ row: r.row, errors });
      else rows.push({ memberId: memberId!, status: status!, note: r.note || null });
    }
    return { rows, issues };
  }

  // ── Session list import ──────────────────────────────────────────────────

  private async context(scope: DepartmentScope) {
    const [types, terms] = await Promise.all([
      this.prisma.classType.findMany({
        where: { isActive: true, ...(scope !== null && { departmentId: { in: scope } }) },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          nameEn: true,
          nameAm: true,
          grades: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { id: true, code: true, nameEn: true, nameAm: true, shortLabel: true },
          },
        },
      }),
      this.prisma.serviceTerm.findMany({
        orderBy: { startsOn: 'desc' },
        select: {
          nameEn: true,
          nameAm: true,
          groups: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              nameEn: true,
              nameAm: true,
              classGrade: { select: { classType: { select: { departmentId: true } } } },
            },
          },
        },
      }),
    ]);
    const label = (n: { nameEn: string; nameAm: string }, lang: Lang) =>
      lang === 'am' ? n.nameAm : n.nameEn;
    const grades = types.flatMap((t) =>
      t.grades.map((g) => ({
        id: g.id,
        labels: (['am', 'en'] as const).map((l) => `${label(t, l)} · ${label(g, l)}`),
        aliases: [g.code, g.shortLabel],
      })),
    );
    const groups = terms.flatMap((term) =>
      term.groups
        .filter((g) => inScope(scope, g.classGrade?.classType.departmentId))
        .map((g) => ({
          id: g.id,
          labels: (['am', 'en'] as const).map((l) => `${label(term, l)} · ${label(g, l)}`),
        })),
    );
    return { grades, groups };
  }

  /** A list of sessions to create — the same fields as the "New session" form, one per row. */
  async buildImportTemplate(lang: Lang, scope: DepartmentScope): Promise<Buffer> {
    const ctx = await this.context(scope);
    const am = lang === 'am';
    const li = am ? 0 : 1;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fikure Egzi Sunday School';
    const sheet = wb.addWorksheet(am ? 'ክፍለ ጊዜዎች' : 'Sessions', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
    const meta = wb.addWorksheet('Meta', { state: 'veryHidden' });
    meta.getCell('A1').value = IMPORT_MARKER;
    meta.getCell('A2').value = 'v2';

    const columns = [
      { key: 'kind', width: 16, en: 'Type *', am: 'ዓይነት *', required: true },
      { key: 'grade', width: 28, en: 'Class', am: 'ክፍል', required: false },
      { key: 'group', width: 28, en: 'Service group', am: 'የአገልግሎት ምድብ', required: false },
      { key: 'title', width: 26, en: 'Title', am: 'ርዕስ', required: false },
      { key: 'date', width: 14, en: 'Date (E.C.) *', am: 'ቀን (ዓ.ም) *', required: true },
      { key: 'start', width: 13, en: 'Starts *', am: 'የሚጀምርበት *', required: true },
      { key: 'end', width: 13, en: 'Ends *', am: 'የሚያበቃበት *', required: true },
      {
        key: 'lateAfter',
        width: 14,
        en: 'Late after (min)',
        am: 'የማርፈጃ ገደብ (ደቂቃ)',
        required: false,
      },
      { key: 'location', width: 22, en: 'Place', am: 'ቦታ', required: false },
    ];
    sheet.columns = columns.map((c) => ({ key: c.key, width: c.width, header: c[lang] }));
    styleHeader(sheet.getRow(1), (col) => columns[col - 1]!.required);
    // Dates stay text, or Excel turns 11/01/2019 into a Gregorian date.
    sheet.getColumn(columns.findIndex((c) => c.key === 'date') + 1).numFmt = '@';

    const last = `${MAX_SESSION_ROWS + 1}`;
    const sources: Record<string, string[]> = {
      kind: Object.values(KIND_LABELS).map((l) => l[lang]),
      grade: ctx.grades.map((g) => g.labels[li]!),
      group: ctx.groups.map((g) => g.labels[li]!),
      time: QUARTER_HOURS.map((t) => formatEthTime(t, lang)),
    };
    const ranges: Record<string, string> = {};
    Object.entries(sources).forEach(
      ([key, values], i) => (ranges[key] = listRange(lists, i + 1, values)),
    );
    const col = (key: string) =>
      sheet.getColumn(columns.findIndex((c) => c.key === key) + 1).letter;
    for (const [key, source] of [
      ['kind', 'kind'],
      ['grade', 'grade'],
      ['group', 'group'],
      ['start', 'time'],
      ['end', 'time'],
    ] as const) {
      if (sources[source]!.length === 0) continue;
      const def = columns.find((c) => c.key === key)!;
      dropdown(sheet, `${col(key)}2:${col(key)}${last}`, ranges[source]!, def[lang], lang);
    }

    const example = formatEcDate(todayIso());
    const help = wb.addWorksheet(am ? 'መመሪያ' : 'Instructions');
    const lines = am
      ? [
          'የክፍለ ጊዜዎች ማስገቢያ ቅጽ — ፍቁረ እግዚእ ሰንበት ትምህርት ቤት',
          '',
          '1. አንድ ረድፍ = አንድ ክፍለ ጊዜ (እንደ "አዲስ ክፍለ ጊዜ" ቅጽ)። የአባላት ዝርዝር አይገባም፤ አቴንዳንሱ በመቃኘት ወይም በክፍለ ጊዜው ኤክሴል ይመዘገባል።',
          '2. "ክፍል" ዓይነት ክፍል ይፈልጋል፤ "የአገልግሎት ምድብ" ዓይነት ምድብ ይፈልጋል፤ "ሌላ" ለጉባኤና ለዝግጅት ነው።',
          `3. ቀኑን በኢትዮጵያ አቆጣጠር ቀን/ወር/ዓመት ይጻፉ፤ ለምሳሌ ${example}። መጪ ቀኖችም ይቻላሉ።`,
          '4. ሰዓቱን በኢትዮጵያ ሰዓት ከዝርዝሩ ይምረጡ፤ ለምሳሌ "ቀን 2:00" (ጠዋት 2 ሰዓት)።',
          '5. ርዕስ ባዶ ከሆነ የክፍሉ ወይም የምድቡ ስም ይወሰዳል። የማርፈጃ ገደብ ባዶ ከሆነ 15 ደቂቃ ነው።',
          '6. ቀድሞ ያለ ተመሳሳይ ክፍለ ጊዜ ይዘለላል፤ ለአንድ ክፍል በአንድ ሰዓት ሁለት ክፍለ ጊዜ አይቻልም።',
          '7. ፋይሉን ሲጭኑ ሁሉም ረድፎች ይፈተሻሉ፤ ስህተት ካለ ምንም አይገባም።',
        ]
      : [
          'Session list template — Fikure Egzi Sunday School',
          '',
          '1. One row = one session (like the "New session" form). No member lists: attendance is recorded by scanning or with the session\'s Excel sheet.',
          '2. "Class" needs a class, "Service group" needs a group, "Other" is for gatherings and events.',
          `3. Write the date in the Ethiopian calendar as day/month/year, e.g. ${example}. Future dates are fine.`,
          '4. Pick times on the Ethiopian clock from the list, e.g. "2:00 day" (8:00 in the morning).',
          '5. An empty title uses the class or group name. An empty late threshold means 15 minutes.',
          "6. A session that already exists is skipped; one class can't have two sessions at the same time.",
          '7. Every row is checked on upload; if any row has an error, nothing is imported.',
        ];
    lines.forEach((line, i) => {
      help.getCell(i + 1, 1).value = line;
      if (i === 0) help.getCell(1, 1).font = { bold: true, size: 14 };
    });
    help.getColumn(1).width = 120;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async previewImport(file: Buffer, lang: Lang, scope: DepartmentScope) {
    const p = await this.parseImport(file, lang, scope);
    return {
      totalRows: p.sessions.length + p.issues.length,
      errorRows: p.issues.length,
      sessions: p.sessions.map((s) => ({
        row: s.row,
        date: s.date,
        kind: s.kind,
        title: s.dto.title,
        start: s.dto.startTime,
        end: s.dto.endTime,
        existing: s.data === null,
      })),
      rows: p.issues.slice(0, 1000),
    };
  }

  /** Creates the listed sessions in one go; if any row is invalid nothing is written. */
  async commitImport(file: Buffer, lang: Lang, userId: number, scope: DepartmentScope) {
    const p = await this.parseImport(file, lang, scope);
    if (p.sessions.length + p.issues.length === 0) {
      throw new UnprocessableEntityException('The file has no sessions.');
    }
    if (p.issues.length > 0) {
      throw new UnprocessableEntityException('Some rows have errors. Nothing was imported.');
    }
    const fresh = p.sessions.filter((s) => s.data !== null);
    const now = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        for (const s of fresh) {
          await tx.attendanceSession.create({
            // Sessions still to come close themselves at their end time.
            data: {
              ...s.data!,
              kind: s.kind,
              createdById: userId,
              autoClose: s.data!.endsAt > now,
            },
          });
        }
        await this.audit.record(
          {
            userId,
            action: 'CREATE',
            entity: 'AttendanceImport',
            changes: { created: fresh.length, skipped: p.sessions.length - fresh.length },
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );
    return { created: fresh.length, skipped: p.sessions.length - fresh.length };
  }

  private async parseImport(
    file: Buffer,
    lang: Lang,
    scope: DepartmentScope,
  ): Promise<ParsedImport> {
    const wb = await loadWorkbook(file);
    if (!wb) throw new UnprocessableEntityException('Upload the .xlsx template (Excel workbook).');
    const meta = wb.getWorksheet('Meta');
    if (meta?.getCell('A1').value !== IMPORT_MARKER || meta.getCell('A2').value !== 'v2') {
      throw new UnprocessableEntityException(
        'This is not the session list template. Download the template and fill it in.',
      );
    }
    const sheet = wb.worksheets.find(
      (w) => w.state === 'visible' && w.name !== 'Lists' && w.name !== 'Meta',
    );
    if (!sheet) throw new UnprocessableEntityException('The sessions sheet is missing.');

    const ctx = await this.context(scope);
    const kinds = new Map<string, AttendanceSessionKind>();
    for (const [kind, labels] of Object.entries(KIND_LABELS)) {
      for (const alias of [kind, labels.en, labels.am])
        kinds.set(normalizeLabel(alias), kind as AttendanceSessionKind);
    }
    const lookup = (items: { id: number; labels: string[]; aliases?: (string | null)[] }[]) => {
      const map = new Map<string, { id: number; labels: string[] }>();
      for (const item of items)
        for (const alias of [...item.labels, ...(item.aliases ?? [])])
          if (alias) map.set(normalizeLabel(alias), { id: item.id, labels: item.labels });
      return map;
    };
    const grades = lookup(ctx.grades);
    const groups = lookup(ctx.groups);
    const keys = [
      'kind',
      'grade',
      'group',
      'title',
      'date',
      'start',
      'end',
      'lateAfter',
      'location',
    ];

    const sessions: ParsedSession[] = [];
    const issues: RowIssues[] = [];
    const li = lang === 'am' ? 0 : 1;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells = Object.fromEntries(keys.map((k, i) => [k, cellText(row.getCell(i + 1).value)]));
      if (Object.values(cells).every((c) => !c.text && !c.isDate)) continue;
      if (sessions.length + issues.length >= MAX_SESSION_ROWS) {
        throw new UnprocessableEntityException(
          `A file can hold at most ${MAX_SESSION_ROWS} sessions.`,
        );
      }
      const errors: Issue[] = [];
      const text = (k: string) => cells[k]!.text;

      const kind = kinds.get(normalizeLabel(text('kind')));
      if (!text('kind')) errors.push({ column: 'kind', code: 'required' });
      else if (!kind)
        errors.push({ column: 'kind', code: 'invalidOption', params: { value: text('kind') } });
      const grade = text('grade') ? grades.get(normalizeLabel(text('grade'))) : undefined;
      if (text('grade') && !grade)
        errors.push({ column: 'grade', code: 'invalidOption', params: { value: text('grade') } });
      const group = text('group') ? groups.get(normalizeLabel(text('group'))) : undefined;
      if (text('group') && !group)
        errors.push({ column: 'group', code: 'invalidOption', params: { value: text('group') } });
      if (kind === AttendanceSessionKind.CLASS && !text('grade'))
        errors.push({ column: 'grade', code: 'required' });
      if (kind === AttendanceSessionKind.SERVICE_GROUP && !text('group'))
        errors.push({ column: 'group', code: 'required' });

      let date: string | null = null;
      if (cells.date!.isDate || cells.date!.isNumber)
        errors.push({ column: 'date', code: 'dateAsNumber' });
      else if (!text('date')) errors.push({ column: 'date', code: 'required' });
      else {
        date = parseEcDate(text('date'));
        if (!date)
          errors.push({ column: 'date', code: 'invalidDate', params: { value: text('date') } });
      }
      const [start, end] = (['start', 'end'] as const).map((k) => {
        if (!text(k)) {
          errors.push({ column: k, code: 'required' });
          return null;
        }
        const t = parseEthTime(text(k));
        if (!t) errors.push({ column: k, code: 'invalidTime', params: { value: text(k) } });
        return t;
      });
      if (start && end && end <= start) errors.push({ column: 'end', code: 'endBeforeStart' });
      const lateAfter = text('lateAfter') ? Number(text('lateAfter')) : 15;
      if (!Number.isInteger(lateAfter) || lateAfter < 0 || lateAfter > 240) {
        errors.push({
          column: 'lateAfter',
          code: 'invalidNumber',
          params: { value: text('lateAfter') },
        });
      }
      if (text('location').length > 150) errors.push({ column: 'location', code: 'tooLong' });
      if (text('title').length > 150) errors.push({ column: 'title', code: 'tooLong' });

      if (errors.length === 0) {
        const isGroup = kind === AttendanceSessionKind.SERVICE_GROUP;
        const dto = {
          title:
            text('title') ||
            (isGroup ? group!.labels[li]! : (grade?.labels[li] ?? KIND_LABELS[kind!][lang])),
          date: date!,
          startTime: start!,
          endTime: end!,
          lateAfterMinutes: lateAfter,
          classGradeId: isGroup ? null : (grade?.id ?? null),
          serviceGroupId: isGroup ? group!.id : null,
          location: text('location') || null,
        };
        const startsAt = addisDateTime(date!, start!);
        const endsAt = addisDateTime(date!, end!);
        // The same session already in the system is skipped, not created twice.
        const existing = await this.prisma.attendanceSession.findFirst({
          where: {
            kind: kind!,
            startsAt,
            endsAt,
            ...(kind === AttendanceSessionKind.CLASS && { classGradeId: dto.classGradeId }),
            ...(isGroup && { serviceGroupId: dto.serviceGroupId }),
            ...(kind === AttendanceSessionKind.OTHER && { title: dto.title }),
          },
          select: { id: true },
        });
        // Two rows for the same class (or same-titled gathering) at overlapping times.
        const audience = `${kind}|${dto.classGradeId ?? ''}|${dto.serviceGroupId ?? ''}|${
          kind === AttendanceSessionKind.OTHER ? normalizeLabel(dto.title) : ''
        }`;
        const clash = sessions.find(
          (s) => s.audience === audience && s.startsAt < endsAt && s.endsAt > startsAt,
        );
        if (clash)
          errors.push({ column: 'start', code: 'overlapInFile', params: { row: clash.row } });
        else {
          let data: ParsedSession['data'] = null;
          if (!existing) {
            try {
              // Same rules as the form: department, overlapping sessions…
              data = await this.attendance.prepareSessionData(dto, kind!, scope);
            } catch (e) {
              if (e instanceof ForbiddenException) {
                errors.push({ column: 'kind', code: 'notYourDepartment' });
              } else if (e instanceof ValidationFailedException) {
                const msg = e.details[0]?.messages[0] ?? '';
                const overlap = /^attendance\.overlap\|(.*)$/.exec(msg);
                errors.push(
                  overlap
                    ? {
                        column: 'start',
                        code: 'overlap',
                        params: JSON.parse(overlap[1]!) as Record<string, string>,
                      }
                    : {
                        column: e.details[0]?.field ?? 'kind',
                        code: 'invalid',
                        params: { value: msg },
                      },
                );
              } else throw e;
            }
          }
          if (errors.length === 0) {
            sessions.push({
              row: r,
              kind: kind!,
              date: date!,
              dto,
              data,
              audience,
              startsAt,
              endsAt,
            });
          }
        }
      }
      if (errors.length > 0) issues.push({ row: r, errors });
    }
    return { sessions, issues };
  }

  /** memberCode → id for the codes in a file (typed "42", "FE-42" and "FE-00042" all work). */
  private async membersByCode(codes: string[]): Promise<Map<string, number>> {
    const normalized = [...new Set(codes.filter(Boolean).map(normalizeMemberCode))];
    const rows = await this.prisma.member.findMany({
      where: { deletedAt: null, memberCode: { in: normalized } },
      select: { id: true, memberCode: true },
    });
    return new Map(rows.map((m) => [m.memberCode, m.id]));
  }
}

interface ParsedSession {
  row: number;
  kind: AttendanceSessionKind;
  date: string;
  dto: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    lateAfterMinutes: number;
    classGradeId: number | null;
    serviceGroupId: number | null;
    location: string | null;
  };
  /** Columns to create; null when the same session already exists (skipped). */
  data: Awaited<ReturnType<AttendanceService['prepareSessionData']>> | null;
  audience: string;
  startsAt: Date;
  endsAt: Date;
}

interface ParsedImport {
  sessions: ParsedSession[];
  issues: RowIssues[];
}

/** "HH:mm" of an instant in Addis Ababa. */
function addisTime(d: Date): string {
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(11, 16);
}
