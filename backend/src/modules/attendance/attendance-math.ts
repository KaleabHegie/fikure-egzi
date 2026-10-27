import { AttendanceStatus } from '../../generated/prisma/enums.js';

/** Ethiopia has no daylight-saving time: Addis Ababa is always UTC+3. */
const ADDIS_OFFSET = '+03:00';

/** 'YYYY-MM-DD' + 'HH:mm' in Addis Ababa → instant. */
export function addisDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${ADDIS_OFFSET}`);
}

/** A check-in at `at` is Late once it is past startsAt + lateAfterMinutes. */
export function statusForCheckIn(
  startsAt: Date,
  lateAfterMinutes: number,
  at: Date,
): AttendanceStatus {
  return at.getTime() > startsAt.getTime() + lateAfterMinutes * 60_000
    ? AttendanceStatus.LATE
    : AttendanceStatus.PRESENT;
}

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
