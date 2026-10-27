import ExcelJS from 'exceljs';

/** Lower-cased, single-spaced text for matching what people type or pick in Excel. */
export const normalizeLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export type CellText = { text: string; isDate: boolean; isNumber: boolean };

/** Reads any ExcelJS cell value as text; flags real dates (Excel auto-converted input). */
export function cellText(value: ExcelJS.CellValue): CellText {
  if (value === null || value === undefined) return { text: '', isDate: false, isNumber: false };
  if (value instanceof Date) return { text: '', isDate: true, isNumber: false };
  if (typeof value === 'number') return { text: String(value), isDate: false, isNumber: true };
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { text: String(value).trim(), isDate: false, isNumber: false };
  }
  if ('richText' in value) {
    return {
      text: value.richText
        .map((r) => r.text)
        .join('')
        .trim(),
      isDate: false,
      isNumber: false,
    };
  }
  if ('text' in value && typeof value.text === 'string') {
    return { text: value.text.trim(), isDate: false, isNumber: false };
  }
  if ('result' in value) return cellText((value.result ?? null) as ExcelJS.CellValue);
  return { text: '', isDate: false, isNumber: false };
}

/** Range-level data validation exists at runtime in ExcelJS 4 but is missing from its typings. */
export const rangeValidations = (sheet: ExcelJS.Worksheet) =>
  (sheet as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } })
    .dataValidations;

/** .xlsx files are zip archives. */
export const isXlsx = (file: Buffer) => file.subarray(0, 4).toString('binary') === 'PK\x03\x04';

/** Loads a workbook, or returns null when the bytes aren't a readable .xlsx. */
export async function loadWorkbook(file: Buffer): Promise<ExcelJS.Workbook | null> {
  if (!isXlsx(file)) return null;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
    return wb;
  } catch {
    return null;
  }
}

/** Styles a header row the same way in every template. */
export function styleHeader(row: ExcelJS.Row, required: (col: number) => boolean) {
  row.height = 32;
  row.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: required(col) ? 'FF076B13' : 'FF2E5D3A' },
    };
  });
}
