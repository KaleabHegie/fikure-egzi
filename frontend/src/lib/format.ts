import { currentLanguage } from '@/i18n'
import { formatEth, formatEthTime } from './ethiopian-calendar'

/*
 * All user-facing dates are Ethiopian calendar (E.C.) — same rule as DPMES —
 * with month names in the current UI language.
 * Never format dates with the browser locale APIs; use these.
 */

/** DATE column (e.g. date of birth) → "Tikimt 16, 2019" / "ጥቅምት 16 ቀን 2019 ዓ.ም". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatEth(iso, 'date', currentLanguage())
}

/** 24-hour "HH:mm" → Ethiopian time, "ከጠዋቱ 2:00" / "2:00 in the morning". */
export function formatTime(hhmm: string): string {
  return formatEthTime(hhmm, currentLanguage())
}

/** Timestamp (e.g. createdAt) → "Tikimt 16, 2019 · ከቀኑ 8:30", local time in Ethiopian time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatEth(iso, 'datetime', currentLanguage())
}

/** Whole years between a DATE value and today. */
export function ageFrom(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null
  const dob = new Date(iso)
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
