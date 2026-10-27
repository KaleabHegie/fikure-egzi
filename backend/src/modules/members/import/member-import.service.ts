import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import ExcelJS from 'exceljs';
import { cellText, rangeValidations } from '../../../common/utils/excel.js';
import { dateOnly, todayIso } from '../../../common/utils/dates.js';
import { formatEcDate, parseEcDate } from '../../../common/utils/ethiopian-calendar.js';
import {
  ETHIOPIAN_PHONE_REGEX,
  normalizeEthiopianPhone,
} from '../../../common/transforms/string.transforms.js';
import { DepartmentRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { openServicePeriod } from '../../history/history.writer.js';
import { CreateMemberDto } from '../dto/create-member.dto.js';
import { MembersService } from '../members.service.js';
import {
  type ColumnDef,
  ENUM_COLUMN,
  ENUM_LABELS,
  type ImportLang,
  LEADING_COLUMNS,
  normalizeLabel,
  TRAILING_COLUMNS,
} from './import-columns.js';

/** Rows accepted per file (the whole Sunday school is ~2,000 members). */
export const MAX_IMPORT_ROWS = 3000;
const TEMPLATE_MARKER = 'fikure-egzi-member-import';
const TEMPLATE_VERSION = 'v1';
const MAX_LENGTHS: Record<string, number> = {
  firstName: 100,
  fatherName: 100,
  grandfatherName: 100,
  christianName: 100,
  placeOfBirth: 100,
  email: 191,
  city: 100,
  subCity: 100,
  woreda: 50,
  kebele: 50,
  houseNumber: 30,
  occupation: 100,
  spiritualFatherName: 150,
  emergencyContactName: 150,
  emergencyContactRelation: 50,
  notes: 2000,
};

export type IssueCode =
  | 'required'
  | 'invalidOption'
  | 'invalidDate'
  | 'dateAsNumber'
  | 'futureDate'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'tooLong'
  | 'seatTaken'
  | 'roleWithoutDepartment'
  | 'duplicateInFile'
  | 'duplicateName'
  | 'possibleDuplicate'
  | 'invalid';

export interface ImportIssue {
  /** Column key (see `columns` in the preview), or null for row-level issues. */
  column: string | null;
  code: IssueCode;
  params?: Record<string, string | number>;
  /** Raw validator text, only for code 'invalid'. */
  message?: string;
}

export interface RowResult {
  /** Spreadsheet row number, as the user sees it in Excel. */
  row: number;
  name: string;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  columns: { key: string; en: string; am: string }[];
  /** Rows with errors or warnings (first 1,000). */
  rows: RowResult[];
}

interface ParsedRow extends RowResult {
  dto: CreateMemberDto | null;
  department: { id: number; role: DepartmentRole } | null;
}

interface Context {
  columns: ColumnDef[];
  classTypes: {
    id: number;
    nameEn: string;
    nameAm: string;
    grades: {
      id: number;
      code: string;
      nameEn: string;
      nameAm: string;
      shortLabel: string | null;
    }[];
  }[];
  departments: { id: number; code: string; nameEn: string; nameAm: string }[];
}

/** "ግዕዝ (ሐ)" unless the name already shows the label ("Grade 5"). Mirrors the web app. */
const gradeLabel = (
  g: { nameEn: string; nameAm: string; shortLabel: string | null },
  lang: ImportLang,
) => {
  const name = lang === 'am' ? g.nameAm : g.nameEn;
  return g.shortLabel && !name.includes(g.shortLabel) ? `${name} (${g.shortLabel})` : name;
};

/** Adds every way a value may be written (both languages, code) to a lookup. */
function addAliases<V>(map: Map<string, V>, value: V, aliases: (string | null | undefined)[]) {
  for (const alias of aliases) {
    if (alias) map.set(normalizeLabel(alias), value);
  }
}

/** Full name as compared for uniqueness: trimmed, case- and spacing-insensitive. */
const fullNameKey = (first: string, father: string, grandfather: string | null) =>
  [first, father, grandfather ?? ''].map((n) => normalizeLabel(n)).join('|');

@Injectable()
export class MemberImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly audit: AuditService,
  ) {}

  private async context(): Promise<Context> {
    const [classTypes, departments] = await Promise.all([
      this.prisma.classType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          nameEn: true,
          nameAm: true,
          grades: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { id: true, code: true, nameEn: true, nameAm: true, shortLabel: true },
          },
        },
      }),
      this.prisma.department.findMany({
        where: { isActive: true },
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, code: true, nameEn: true, nameAm: true },
      }),
    ]);
    const classColumns: ColumnDef[] = classTypes.map((c) => ({
      key: `class:${c.id}`,
      header: { en: c.nameEn, am: c.nameAm },
      kind: 'class',
      width: 18,
    }));
    return {
      columns: [...LEADING_COLUMNS, ...classColumns, ...TRAILING_COLUMNS],
      classTypes,
      departments,
    };
  }

  // ── Template ─────────────────────────────────────────────────────────────

  /** A workbook whose dropdowns reflect the current classes and departments. */
  async buildTemplate(lang: ImportLang): Promise<Buffer> {
    const ctx = await this.context();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fikure Egzi Sunday School';
    wb.created = new Date();

    const sheet = wb.addWorksheet(lang === 'am' ? 'አባላት' : 'Members', {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    });
    const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
    const meta = wb.addWorksheet('Meta', { state: 'veryHidden' });
    const help = wb.addWorksheet(lang === 'am' ? 'መመሪያ' : 'Instructions');

    meta.getCell('A1').value = TEMPLATE_MARKER;
    meta.getCell('A2').value = TEMPLATE_VERSION;
    meta.getRow(3).values = ctx.columns.map((c) => c.key);

    // Dropdown sources, one column each on the hidden Lists sheet.
    const listOptions: Record<string, string[]> = {};
    for (const [key, enumKey] of Object.entries(ENUM_COLUMN)) {
      listOptions[key] = Object.values(ENUM_LABELS[enumKey!]).map((l) => l[lang]);
    }
    for (const type of ctx.classTypes) {
      listOptions[`class:${type.id}`] = type.grades.map((g) => gradeLabel(g, lang));
    }
    listOptions.department = ctx.departments.map((d) => (lang === 'am' ? d.nameAm : d.nameEn));
    let listCol = 1;
    const listRange: Record<string, string> = {};
    for (const [key, values] of Object.entries(listOptions)) {
      if (values.length === 0) continue;
      values.forEach((v, i) => (lists.getCell(i + 1, listCol).value = v));
      const letter = lists.getColumn(listCol).letter;
      listRange[key] = `Lists!$${letter}$1:$${letter}$${values.length}`;
      listCol += 1;
    }

    // Header row.
    sheet.columns = ctx.columns.map((c) => ({
      key: c.key,
      width: c.width,
      header: `${c.header[lang]}${c.required ? ' *' : ''}`,
    }));
    const header = sheet.getRow(1);
    header.height = 32;
    header.eachCell((cell, colNumber) => {
      const def = ctx.columns[colNumber - 1]!;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: def.required ? 'FF076B13' : 'FF2E5D3A' },
      };
    });

    const last = MAX_IMPORT_ROWS + 1;
    ctx.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      const range = `${column.letter}2:${column.letter}${last}`;
      // Dates and phones must stay text: Excel would turn 11/01/2010 into a
      // Gregorian date and drop the leading 0 of 0911….
      if (c.kind === 'ecDate' || c.kind === 'phone') column.numFmt = '@';
      const source = listRange[c.key];
      if (source) {
        rangeValidations(sheet).add(range, {
          type: 'list',
          allowBlank: !c.required,
          formulae: [source],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: c.header[lang],
          error: lang === 'am' ? 'ከዝርዝሩ ውስጥ ይምረጡ።' : 'Choose a value from the list.',
        });
      }
    });

    this.writeInstructions(help, ctx, lang);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private writeInstructions(help: ExcelJS.Worksheet, ctx: Context, lang: ImportLang) {
    const am = lang === 'am';
    const example = formatEcDate(todayIso());
    const lines: string[] = am
      ? [
          'የአባላት ማስገቢያ ቅጽ — ፍቁረ እግዚእ ሰንበት ትምህርት ቤት',
          '',
          '1. በ"አባላት" ሉህ ላይ አንድ አባል በአንድ ረድፍ ይሙሉ። * ምልክት ያለባቸው መስኮች ግዴታ ናቸው።',
          '2. ቀኖችን በኢትዮጵያ አቆጣጠር ቀን/ወር/ዓመት ይጻፉ፤ ለምሳሌ ' + example + '።',
          '3. ጾታ፣ ሁኔታ፣ ክፍሎችና የአገልግሎት ክፍል ከተዘረዘሩት አማራጮች ይምረጡ።',
          '4. የተቀላቀሉበት ቀን ባዶ ከሆነ የዛሬው ቀን ይወሰዳል። ሁኔታ ባዶ ከሆነ "ንቁ" ይሆናል።',
          '5. የአባላት ሙሉ ስም (ስም፣ የአባት ስም፣ የአያት ስም) አንድ ብቻ ሊሆን ይገባል፤ ቀድሞ የተመዘገበ ሙሉ ስም አይቀበልም።',
          '6. ፋይሉን ሲጭኑ ሁሉም ረድፎች ይፈተሻሉ፤ ስህተት ካለ ምንም አይገባም።',
        ]
      : [
          'Member import template — Fikure Egzi Sunday School',
          '',
          '1. Fill one member per row on the "Members" sheet. Columns marked * are required.',
          `2. Write dates in the Ethiopian calendar as day/month/year, e.g. ${example}.`,
          '3. Pick gender, status, classes and department from the dropdown lists.',
          '4. An empty join date means today; an empty status means Active.',
          "5. Full names (first + father's + grandfather's name) must be unique; a name already registered is refused.",
          '6. Every row is checked on upload; if any row has an error, nothing is imported.',
        ];
    lines.forEach((line, i) => {
      const cell = help.getCell(i + 1, 1);
      cell.value = line;
      if (i === 0) cell.font = { bold: true, size: 14 };
    });
    help.getColumn(1).width = 110;
    const start = lines.length + 2;
    help.getCell(start, 1).value = am ? 'ክፍሎች' : 'Classes';
    help.getCell(start, 1).font = { bold: true };
    ctx.classTypes.forEach((c, i) => {
      help.getCell(start + 1 + i, 1).value =
        `${am ? c.nameAm : c.nameEn}: ${c.grades.map((g) => gradeLabel(g, lang)).join(', ')}`;
    });
  }

  // ── Parse & validate ─────────────────────────────────────────────────────

  async preview(file: Buffer): Promise<ImportPreview> {
    const { rows, ctx } = await this.parse(file);
    return this.summarize(rows, ctx);
  }

  private summarize(rows: ParsedRow[], ctx: Context): ImportPreview {
    const flagged = rows.filter((r) => r.errors.length > 0 || r.warnings.length > 0);
    return {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.errors.length === 0).length,
      errorRows: rows.filter((r) => r.errors.length > 0).length,
      warningRows: rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length,
      columns: ctx.columns.map((c) => ({ key: c.key, ...c.header })),
      rows: flagged
        .slice(0, 1000)
        .map(({ row, name, errors, warnings }) => ({ row, name, errors, warnings })),
    };
  }

  private async parse(file: Buffer): Promise<{ rows: ParsedRow[]; ctx: Context }> {
    if (file.subarray(0, 4).toString('binary') !== 'PK\x03\x04') {
      throw new UnprocessableEntityException('Upload the .xlsx template (Excel workbook).');
    }
    const ctx = await this.context();
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file as unknown as ArrayBuffer);
    } catch {
      throw new UnprocessableEntityException('This file could not be read as an Excel workbook.');
    }

    const meta = wb.getWorksheet('Meta');
    if (meta?.getCell('A1').value !== TEMPLATE_MARKER) {
      throw new UnprocessableEntityException(
        'This is not the member import template. Download the template and fill it in.',
      );
    }
    const keys = (meta.getRow(3).values as ExcelJS.CellValue[])
      .slice(1)
      .map((v) => String(v ?? ''));
    const sheet = wb.worksheets.find(
      (w) => w.state === 'visible' && w.name !== 'Lists' && w.name !== 'Meta',
    );
    if (!sheet) throw new UnprocessableEntityException('The Members sheet is missing.');

    const lookups = this.buildLookups(ctx);
    const existing = await this.existingIndex();
    const seats = await this.takenSeats();
    const seenInFile = new Map<string, number>();
    const rows: ParsedRow[] = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells = new Map<string, ReturnType<typeof cellText>>();
      keys.forEach((key, i) => cells.set(key, cellText(row.getCell(i + 1).value)));
      if ([...cells.values()].every((c) => !c.text && !c.isDate)) continue; // blank row
      if (rows.length >= MAX_IMPORT_ROWS) {
        throw new UnprocessableEntityException(
          `A file can hold at most ${MAX_IMPORT_ROWS} members.`,
        );
      }
      rows.push(await this.parseRow(r, cells, ctx, lookups, existing, seats, seenInFile));
    }
    return { rows, ctx };
  }

  private buildLookups(ctx: Context) {
    const enums = new Map<string, Map<string, string>>();
    for (const [column, enumKey] of Object.entries(ENUM_COLUMN)) {
      const map = new Map<string, string>();
      for (const [value, labels] of Object.entries(ENUM_LABELS[enumKey!])) {
        addAliases(map, value, [value, labels.en, labels.am]);
      }
      enums.set(column, map);
    }
    const grades = new Map<string, Map<string, number>>();
    for (const type of ctx.classTypes) {
      const map = new Map<string, number>();
      for (const g of type.grades) {
        addAliases(map, g.id, [
          g.code,
          g.nameEn,
          g.nameAm,
          g.shortLabel,
          gradeLabel(g, 'en'),
          gradeLabel(g, 'am'),
        ]);
      }
      grades.set(`class:${type.id}`, map);
    }
    const departments = new Map<string, number>();
    for (const d of ctx.departments) addAliases(departments, d.id, [d.code, d.nameEn, d.nameAm]);
    return { enums, grades, departments };
  }

  /** Existing members by name+birth date and by phone, to flag likely duplicates. */
  private async existingIndex() {
    const rows = await this.prisma.member.findMany({
      where: { deletedAt: null },
      select: {
        memberCode: true,
        firstName: true,
        fatherName: true,
        grandfatherName: true,
        dateOfBirth: true,
        phone: true,
      },
    });
    const byNameDob = new Map<string, string>();
    const byNamePhone = new Map<string, string>();
    const byFullName = new Map<string, string>();
    for (const m of rows) {
      byFullName.set(fullNameKey(m.firstName, m.fatherName, m.grandfatherName), m.memberCode);
      const name = `${normalizeLabel(m.firstName)}|${normalizeLabel(m.fatherName)}`;
      if (m.dateOfBirth)
        byNameDob.set(`${name}|${m.dateOfBirth.toISOString().slice(0, 10)}`, m.memberCode);
      if (m.phone) byNamePhone.set(`${name}|${m.phone}`, m.memberCode);
    }
    return { byNameDob, byNamePhone, byFullName };
  }

  /** Departments whose Head / Deputy seat is already filled. */
  private async takenSeats() {
    const rows = await this.prisma.departmentMembership.findMany({
      where: {
        role: { in: [DepartmentRole.HEAD, DepartmentRole.DEPUTY] },
        member: { deletedAt: null },
      },
      select: { departmentId: true, role: true },
    });
    return new Set(rows.map((r) => `${r.departmentId}|${r.role}`));
  }

  private async parseRow(
    rowNumber: number,
    cells: Map<string, ReturnType<typeof cellText>>,
    ctx: Context,
    lookups: ReturnType<MemberImportService['buildLookups']>,
    existing: Awaited<ReturnType<MemberImportService['existingIndex']>>,
    seats: Set<string>,
    seenInFile: Map<string, number>,
  ): Promise<ParsedRow> {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const text = (key: string) => cells.get(key)?.text ?? '';
    const plain: Record<string, unknown> = {};
    const today = todayIso();

    for (const def of ctx.columns) {
      const cell = cells.get(def.key) ?? { text: '', isDate: false, isNumber: false };
      const value = cell.text;
      if (!value && !cell.isDate) {
        if (def.required) errors.push({ column: def.key, code: 'required' });
        continue;
      }
      switch (def.kind) {
        case 'text': {
          const max = MAX_LENGTHS[def.key];
          if (max && value.length > max)
            errors.push({ column: def.key, code: 'tooLong', params: { max } });
          else plain[def.key] = value;
          break;
        }
        case 'ecDate': {
          if (cell.isDate || cell.isNumber) {
            errors.push({ column: def.key, code: 'dateAsNumber' });
            break;
          }
          const iso = parseEcDate(value);
          if (!iso) errors.push({ column: def.key, code: 'invalidDate', params: { value } });
          else if (iso > today)
            errors.push({ column: def.key, code: 'futureDate', params: { value } });
          else plain[def.key] = iso;
          break;
        }
        case 'phone': {
          // A 9-digit number means Excel dropped the leading 0 (911223344).
          const raw = cell.isNumber && /^[79]\d{8}$/.test(value) ? `0${value}` : value;
          const phone = normalizeEthiopianPhone(raw);
          if (!ETHIOPIAN_PHONE_REGEX.test(phone)) {
            errors.push({ column: def.key, code: 'invalidPhone', params: { value } });
          } else plain[def.key] = phone;
          break;
        }
        case 'enum':
        case 'role': {
          const match = lookups.enums.get(def.key)?.get(normalizeLabel(value));
          if (!match) errors.push({ column: def.key, code: 'invalidOption', params: { value } });
          else plain[def.key] = match;
          break;
        }
        case 'class': {
          const match = lookups.grades.get(def.key)?.get(normalizeLabel(value));
          if (!match) errors.push({ column: def.key, code: 'invalidOption', params: { value } });
          else ((plain.classGradeIds ??= []) as number[]).push(match);
          break;
        }
        case 'department': {
          const match = lookups.departments.get(normalizeLabel(value));
          if (!match) errors.push({ column: def.key, code: 'invalidOption', params: { value } });
          else plain.department = match;
          break;
        }
      }
    }

    if (
      typeof plain.dateOfBirth === 'string' &&
      typeof plain.joinedAt === 'string' &&
      plain.joinedAt < plain.dateOfBirth
    ) {
      errors.push({ column: 'joinedAt', code: 'invalidDate', params: { value: text('joinedAt') } });
    }
    if (typeof plain.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(plain.email)) {
      errors.push({ column: 'email', code: 'invalidEmail', params: { value: plain.email } });
      delete plain.email;
    }

    // Department + role.
    const departmentId = plain.department as number | undefined;
    const role = (plain.departmentRole as DepartmentRole | undefined) ?? DepartmentRole.MEMBER;
    delete plain.department;
    delete plain.departmentRole;
    if (!departmentId && text('departmentRole')) {
      errors.push({ column: 'departmentRole', code: 'roleWithoutDepartment' });
    }
    if (departmentId && (role === DepartmentRole.HEAD || role === DepartmentRole.DEPUTY)) {
      const seat = `${departmentId}|${role}`;
      if (seats.has(seat)) errors.push({ column: 'departmentRole', code: 'seatTaken' });
      else if (errors.length === 0) seats.add(seat); // a later row can't take the same seat
    }

    // Final pass through the same rules the API applies to the registration form.
    let dto: CreateMemberDto | null = null;
    if (errors.length === 0) {
      const candidate = plainToInstance(CreateMemberDto, plain);
      const failures = await validate(candidate, { whitelist: true, forbidNonWhitelisted: true });
      for (const f of failures) {
        errors.push({
          column: f.property === 'classGradeIds' ? null : f.property,
          code: 'invalid',
          message: Object.values(f.constraints ?? {}).join('; '),
        });
      }
      if (failures.length === 0) dto = candidate;
    }

    // A full name that is already taken (or used earlier in the file) is an error.
    const full = fullNameKey(text('firstName'), text('fatherName'), text('grandfatherName'));
    const taken = existing.byFullName.get(full);
    const earlierFull = seenInFile.get(`full:${full}`);
    if (taken) errors.push({ column: 'firstName', code: 'duplicateName', params: { code: taken } });
    else if (earlierFull) {
      errors.push({ column: 'firstName', code: 'duplicateInFile', params: { row: earlierFull } });
    } else seenInFile.set(`full:${full}`, rowNumber);

    // Same first + father's name with the same birth date or phone: probably the same person.
    const name = `${normalizeLabel(text('firstName'))}|${normalizeLabel(text('fatherName'))}`;
    const dob = typeof plain.dateOfBirth === 'string' ? plain.dateOfBirth : '';
    const phone = typeof plain.phone === 'string' ? plain.phone : '';
    const match =
      (dob && existing.byNameDob.get(`${name}|${dob}`)) ||
      (phone && existing.byNamePhone.get(`${name}|${phone}`));
    if (match && !taken) {
      warnings.push({ column: null, code: 'possibleDuplicate', params: { code: match } });
    }

    return {
      row: rowNumber,
      name: [text('firstName'), text('fatherName'), text('grandfatherName')]
        .filter(Boolean)
        .join(' '),
      errors,
      warnings,
      dto,
      department: departmentId && dto ? { id: departmentId, role } : null,
    };
  }

  // ── Commit ───────────────────────────────────────────────────────────────

  /** Imports every row in one transaction: if any row is invalid, nothing is written. */
  async commit(file: Buffer, userId: number, ipAddress: string | null) {
    const { rows, ctx } = await this.parse(file);
    if (rows.length === 0) throw new UnprocessableEntityException('The file has no member rows.');
    if (rows.some((r) => r.errors.length > 0)) {
      throw new UnprocessableEntityException({
        message: 'Some rows have errors. Nothing was imported.',
        preview: this.summarize(rows, ctx),
      });
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const ids: number[] = [];
        for (const row of rows) {
          const member = await this.members.create(row.dto!, userId, ipAddress, tx);
          ids.push(member.id);
          if (row.department) {
            const joinedAt = dateOnly(row.dto!.joinedAt ?? todayIso());
            await tx.departmentMembership.create({
              data: {
                departmentId: row.department.id,
                memberId: member.id,
                role: row.department.role,
                joinedAt,
                createdById: userId,
              },
            });
            await openServicePeriod(
              tx,
              { memberId: member.id, departmentId: row.department.id, role: row.department.role },
              joinedAt,
              userId,
            );
          }
        }
        await this.audit.record(
          {
            userId,
            action: 'CREATE',
            entity: 'MemberImport',
            changes: { count: ids.length },
            ipAddress,
          },
          tx,
        );
        return ids;
      },
      { timeout: 300_000, maxWait: 15_000 },
    );
    return { imported: created.length };
  }
}
