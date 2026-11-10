import { AttendanceStatus } from '../../generated/prisma/enums.js';

/** Ethiopia has no daylight-saving time: Addis Ababa is always UTC+3. */
const ADDIS_OFFSET = '+03:00';

/** 'YYYY-MM-DD' + 'HH:mm' in Addis Ababa → instant. */
export function addisDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${ADDIS_OFFSET}`);
}

/**
 * The mark a check-in at `at` earns. Present until startsAt + lateAfterMinutes,
 * Late after that, Absent past startsAt + absentAfterMinutes (when the session
 * has a cut-off). A late permission's grace minutes keep the member Present
 * until startsAt + graceMinutes and push their Absent cut-off later by as much.
 */
export function statusForCheckIn(
  startsAt: Date,
  lateAfterMinutes: number,
  at: Date,
  { absentAfterMinutes = null, graceMinutes = 0 }: CheckInRules = {},
): AttendanceStatus {
  const after = (at.getTime() - startsAt.getTime()) / 60_000;
  if (absentAfterMinutes !== null && after > absentAfterMinutes + graceMinutes) {
    return AttendanceStatus.ABSENT;
  }
  return after > Math.max(lateAfterMinutes, graceMinutes)
    ? AttendanceStatus.LATE
    : AttendanceStatus.PRESENT;
}

export interface CheckInRules {
  absentAfterMinutes?: number | null;
  /** The member's late-permission grace for this session (0 = none). */
  graceMinutes?: number;
}

/**
 * When an open session closes itself: at its end time, or — with an absent
 * cut-off — at that cut-off, held open for the longest grace among members
 * with a late permission for it.
 */
export function closesAt(
  session: { startsAt: Date; endsAt: Date; absentAfterMinutes: number | null },
  longestGraceMinutes = 0,
): Date {
  if (session.absentAfterMinutes === null) return session.endsAt;
  return new Date(
    session.startsAt.getTime() + (session.absentAfterMinutes + longestGraceMinutes) * 60_000,
  );
}

/** Day of the week (0 = Sunday) of a 'YYYY-MM-DD' date. */
export const weekdayOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();

/**
 * Minutes a member spent at a session:
 *   Present → the whole session;
 *   Late    → from check-in to the end (or, without a check-in time, the
 *             session minus the grace period);
 *   Absent / Excused → 0.
 */
export function minutesAttended(
  record: { status: AttendanceStatus; checkedInAt: Date | null },
  session: { startsAt: Date; endsAt: Date; lateAfterMinutes: number },
): number {
  const duration = Math.max(0, (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000);
  if (record.status === AttendanceStatus.PRESENT) return Math.round(duration);
  if (record.status !== AttendanceStatus.LATE) return 0;
  if (!record.checkedInAt) return Math.round(Math.max(0, duration - session.lateAfterMinutes));
  const from = Math.max(record.checkedInAt.getTime(), session.startsAt.getTime());
  return Math.round(Math.max(0, (session.endsAt.getTime() - from) / 60_000));
}

export interface StatusCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

/**
 * Attendance rate in % — (present + late) / (present + late + absent).
 * Excused sessions are left out on purpose: an excused absence should not
 * lower anyone's rate. Null when nothing counts yet.
 */
export function attendanceRate(c: StatusCounts): number | null {
  const counted = c.present + c.late + c.absent;
  return counted === 0 ? null : Math.round(((c.present + c.late) / counted) * 1000) / 10;
}

export const emptyCounts = (): StatusCounts => ({ present: 0, late: 0, absent: 0, excused: 0 });

export function addCount(c: StatusCounts, status: AttendanceStatus, n = 1): StatusCounts {
  const key = status.toLowerCase() as keyof StatusCounts;
  c[key] += n;
  return c;
}

/** Normalizes what a scanner/keyboard delivers into a member code: 'fe-42', '42' → 'FE-00042'. */
export function normalizeMemberCode(raw: string): string {
  const text = raw.trim().toUpperCase();
  const digits = /^(?:FE-?)?0*(\d{1,7})$/.exec(text);
  return digits ? `FE-${digits[1]!.padStart(5, '0')}` : text;
}
