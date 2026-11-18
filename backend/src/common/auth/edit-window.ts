import { todayIso } from '../utils/dates.js';

/**
 * Exam takers and attendance admins may change an exam or an attendance
 * session up to this many days after its day; afterwards only department
 * heads, the ፅህፈት ቤት and office administrators can.
 */
export const EDIT_WINDOW_DAYS = 5;

const shiftIso = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The last day ('YYYY-MM-DD', Addis Ababa) on which the work of `dayIso` can still be changed. */
export const editableUntil = (dayIso: string): string => shiftIso(dayIso, EDIT_WINDOW_DAYS);

/** Whether it is still no later than five days after `dayIso` (future days included). */
export const withinEditWindow = (dayIso: string, now = new Date()): boolean =>
  todayIso(now) <= editableUntil(dayIso);
