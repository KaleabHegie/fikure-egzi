import { formatDate, formatTime } from '@/lib/format'

/*
 * Sessions happen in Addis Ababa (UTC+3, no daylight saving). These helpers
 * read and write their times as Addis wall-clock time regardless of the
 * browser's time zone, without the browser locale APIs (see lint rule).
 */
const ADDIS_MS = 3 * 3_600_000
const addis = (iso: string) => new Date(new Date(iso).getTime() + ADDIS_MS).toISOString()

/** Gregorian 'YYYY-MM-DD' of the instant in Addis Ababa. */
export const addisDate = (iso: string) => addis(iso).slice(0, 10)
/** 'HH:mm' (24h) of the instant in Addis Ababa. */
export const addisTime = (iso: string) => addis(iso).slice(11, 16)

/** E.C. date of the session, e.g. "Tikimt 16, 2019". */
export const sessionDate = (startsAt: string) => formatDate(`${addisDate(startsAt)}T00:00:00.000Z`)

/** Ethiopian time of the instant, e.g. "ከጠዋቱ 2:00". */
export const addisEthTime = (iso: string) => formatTime(addisTime(iso))

/** "ከጠዋቱ 2:00 – ከጠዋቱ 5:00" (Ethiopian time) */
export const sessionTimes = (startsAt: string, endsAt: string) => `${addisEthTime(startsAt)} – ${addisEthTime(endsAt)}`

/** "2 h 15 min" style, translated. */
export function formatDuration(minutes: number, t: (key: 'attendance.hoursMinutes' | 'attendance.minutesOnly', o: { h: number; m: number }) => string) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? t('attendance.hoursMinutes', { h, m }) : t('attendance.minutesOnly', { h, m })
}
