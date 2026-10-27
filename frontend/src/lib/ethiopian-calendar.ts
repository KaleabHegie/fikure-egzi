/**
 * Ethiopian (Amete Mihret) calendar — the ONLY place this app may translate
 * between E.C. and Gregorian. Ported from DPMES (lib/ethiopian-calendar.ts)
 * and pinned to the same golden vectors (src/lib/__fixtures__).
 *
 * Convention (same as DPMES): storage and the API stay Gregorian ISO
 * ("YYYY-MM-DD"); every date a user SEES or PICKS is Ethiopian calendar.
 * Never convert with a constant ±7/±8 years — the offset flips at Ethiopian
 * new year. `npm run lint` enforces this (scripts/check-calendar-arithmetic.sh).
 *
 * Conversion goes through the Julian Day Number (Beyene–Kudlek): exact
 * integer arithmetic.
 */

export type EthiopianDate = { year: number; month: number; day: number }
export type CalendarLang = 'am' | 'en'

/** Default month-name language when none is given (callers pass the UI language). */
export const DATE_LANG: CalendarLang = 'en'

export const ETHIOPIAN_MONTHS_EN = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miazia',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
] as const

export const ETHIOPIAN_MONTHS_AM = [
  'መስከረም',
  'ጥቅምት',
  'ኅዳር',
  'ታኅሣሥ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜ',
] as const

// --- JDN core ---------------------------------------------------------------

/** Ethiopic (Amete Mihret) epoch in JDN. */
const ETHIOPIC_EPOCH = 1723856

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  )
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((146097 * b) / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor((1461 * d) / 4)
  const m = Math.floor((5 * e + 2) / 153)
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  }
}

function jdnToEthiopian(jdn: number): EthiopianDate {
  const r = (jdn - ETHIOPIC_EPOCH) % 1461
  const n = (r % 365) + 365 * Math.floor(r / 1460)
  const year = 4 * Math.floor((jdn - ETHIOPIC_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460)
  return { year, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 }
}

function ethiopianToJdn(year: number, month: number, day: number): number {
  return ETHIOPIC_EPOCH + 365 * year + Math.floor(year / 4) + 30 * (month - 1) + (day - 1)
}

// --- Calendar structure -----------------------------------------------------

/** Pagume has 6 days when `ecYear % 4 === 3` (no century exception). */
export function isEcLeap(ecYear: number): boolean {
  return ecYear % 4 === 3
}

export function pagumeDays(ecYear: number): number {
  return isEcLeap(ecYear) ? 6 : 5
}

export function ecMonthDays(ecYear: number, ecMonth: number): number {
  if (ecMonth < 1 || ecMonth > 13) throw new RangeError(`Ethiopian month out of range: ${ecMonth}`)
  return ecMonth <= 12 ? 30 : pagumeDays(ecYear)
}

// --- Conversions --------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

export function gregorianToEthiopian(year: number, month: number, day: number): EthiopianDate {
  return jdnToEthiopian(gregorianToJdn(year, month, day))
}

/**
 * Gregorian → E.C. Strings are read by their calendar-date part, which is
 * right for DATE columns (the API sends them as UTC midnight). A Date object
 * is read in the user's local time zone.
 */
export function gcToEc(value: string | Date): EthiopianDate | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return gregorianToEthiopian(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  const [y, m, d] = (value || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return gregorianToEthiopian(y, m, d)
}

/** E.C. date → Gregorian ISO "YYYY-MM-DD" (what the API stores). */
export function ecToGcIso(ecYear: number, ecMonth: number, ecDay: number): string {
  if (ecDay < 1 || ecDay > ecMonthDays(ecYear, ecMonth)) {
    throw new RangeError(`Ethiopian day out of range: ${ecYear}-${ecMonth}-${ecDay}`)
  }
  const g = jdnToGregorian(ethiopianToJdn(ecYear, ecMonth, ecDay))
  return `${g.year}-${pad(g.month)}-${pad(g.day)}`
}

/** Today in the Ethiopian calendar. */
export function ecToday(now: Date = new Date()): EthiopianDate {
  return gcToEc(now) as EthiopianDate
}

/** Today as a Gregorian ISO date in the user's local time zone. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function ecYearBounds(ecYear: number): { start: string; end: string } {
  return { start: ecToGcIso(ecYear, 1, 1), end: ecToGcIso(ecYear, 13, pagumeDays(ecYear)) }
}

export function ecMonthBounds(ecYear: number, ecMonth: number): { start: string; end: string } {
  return {
    start: ecToGcIso(ecYear, ecMonth, 1),
    end: ecToGcIso(ecYear, ecMonth, ecMonthDays(ecYear, ecMonth)),
  }
}

export function ecMonthName(ecMonth: number, lang: CalendarLang = DATE_LANG): string {
  const names = lang === 'am' ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS_EN
  const name = names[ecMonth - 1]
  if (!name) throw new RangeError(`Ethiopian month out of range: ${ecMonth}`)
  return name
}

// --- Formatting (the app's ONLY date formatter — see lib/format.ts) ----------

export type EthFormatStyle = 'date' | 'datetime' | 'month' | 'year'

/**
 * Renders a Gregorian date/datetime in the Ethiopian calendar (DPMES formats):
 *   date      Tikimt 16, 2019          / ጥቅምት 16 ቀን 2019 ዓ.ም
 *   datetime  Tikimt 16, 2019 · 14:30  / ጥቅምት 16 ቀን 2019 ዓ.ም · 14:30  (24h, local)
 *   month     Tikimt 2019              / ጥቅምት 2019
 *   year      2019                     / 2019 ዓ.ም
 * Use 'date' for DATE columns and 'datetime' for timestamps.
 */
export function formatEth(
  value: string | Date,
  style: EthFormatStyle = 'date',
  lang: CalendarLang = DATE_LANG,
): string {
  // Timestamps are shown in local time, so their calendar day is local too.
  const local = style === 'datetime' ? (value instanceof Date ? value : new Date(value)) : null
  const ec = local ? gcToEc(local) : gcToEc(value)
  if (!ec) return typeof value === 'string' ? value : ''

  const month = ecMonthName(ec.month, lang)
  const am = lang === 'am'
  const datePart = am ? `${month} ${ec.day} ቀን ${ec.year} ዓ.ም` : `${month} ${ec.day}, ${ec.year}`
  switch (style) {
    case 'year':
      return am ? `${ec.year} ዓ.ም` : String(ec.year)
    case 'month':
      return `${month} ${ec.year}`
    case 'datetime':
      return local
        ? `${datePart} · ${formatEthTime(`${pad(local.getHours())}:${pad(local.getMinutes())}`, lang)}`
        : datePart
    default:
      return datePart
  }
}

// ── Ethiopian time ─────────────────────────────────────────────────────────
// The Ethiopian clock has two halves, each counted 1–12: day (ቀን) runs from
// 1 = 07:00 to 12 = 18:00 (sunset), night (ማታ) from 1 = 19:00 to 12 = 06:00
// (dawn). Times are stored as ordinary 24-hour "HH:mm"; only display and
// input use this clock.

export type EthDayPart = 'day' | 'night'
export const ETH_DAY_PARTS: readonly EthDayPart[] = ['day', 'night']

const DAY_PART_LABELS: Record<CalendarLang, Record<EthDayPart, string>> = {
  am: { day: 'ቀን', night: 'ማታ' },
  en: { day: 'day', night: 'night' },
}

export function ethDayPartLabel(part: EthDayPart, lang: CalendarLang = DATE_LANG): string {
  return DAY_PART_LABELS[lang][part]
}

/** Ethiopian clock hour (1–12) of a 24-hour hour: 7 → 1, 12 → 6, 18 → 12, 0 → 6, 6 → 12. */
export function ethHour(hour24: number): number {
  return (hour24 + 6) % 12 || 12
}

/** 07–18 is day (ቀን 1–12), 19–06 is night (ማታ 1–12). */
export function ethDayPart(hour24: number): EthDayPart {
  return hour24 >= 7 && hour24 <= 18 ? 'day' : 'night'
}

/** 24-hour hour of an Ethiopian hour: day 1 → 7, day 12 → 18, night 1 → 19, night 12 → 6. */
export function hour24FromEth(part: EthDayPart, hour: number): number {
  return part === 'day' ? 6 + hour : (18 + hour) % 24
}

/** "ቀን 2:00" / "2:00 day" for a 24-hour "HH:mm" (08:00). */
export function formatEthTime(hhmm: string, lang: CalendarLang = DATE_LANG): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const clock = `${ethHour(h)}:${pad(m)}`
  const part = DAY_PART_LABELS[lang][ethDayPart(h)]
  return lang === 'am' ? `${part} ${clock}` : `${clock} ${part}`
}
