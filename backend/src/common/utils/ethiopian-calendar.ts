/**
 * Ethiopian (Amete Mihret) ↔ Gregorian conversion for the API — used where
 * people type E.C. dates (Excel import). Same algorithm and golden vectors as
 * the web app's src/lib/ethiopian-calendar.ts and DPMES.
 */
export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
}

const ETHIOPIC_EPOCH = 1723856;

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export function ecMonthDays(year: number, month: number): number {
  if (month < 1 || month > 13) return 0;
  return month <= 12 ? 30 : year % 4 === 3 ? 6 : 5;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** E.C. → Gregorian 'YYYY-MM-DD', or null when the E.C. date does not exist. */
export function ecToGcIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || day < 1 || day > ecMonthDays(year, month)) return null;
  const jdn = ETHIOPIC_EPOCH + 365 * year + Math.floor(year / 4) + 30 * (month - 1) + (day - 1);
  const g = jdnToGregorian(jdn);
  return `${g.year}-${pad(g.month)}-${pad(g.day)}`;
}

/** Gregorian 'YYYY-MM-DD' → E.C. */
export function gcIsoToEc(iso: string): EthiopianDate {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  const jdn = gregorianToJdn(y, m, d);
  const r = (jdn - ETHIOPIC_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year =
    4 * Math.floor((jdn - ETHIOPIC_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  return { year, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

/**
 * Parses a typed E.C. date: 'dd/mm/yyyy' (also '-' or '.' separators).
 * Returns the Gregorian ISO date, or null if malformed or nonexistent.
 */
export function parseEcDate(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  return ecToGcIso(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** Gregorian ISO → 'dd/mm/yyyy' E.C. (template examples). */
export function formatEcDate(iso: string): string {
  const ec = gcIsoToEc(iso);
  return `${pad(ec.day)}/${pad(ec.month)}/${ec.year}`;
}
