import {
  addisDateTime,
  attendanceRate,
  closesAt,
  weekdayOf,
  minutesAttended,
  normalizeMemberCode,
  statusForCheckIn,
} from './attendance-math.js';

const session = {
  startsAt: addisDateTime('2026-10-25', '08:00'),
  endsAt: addisDateTime('2026-10-25', '11:00'),
  lateAfterMinutes: 15,
};

describe('attendance math', () => {
  it('reads times as Addis Ababa local time', () => {
    expect(session.startsAt.toISOString()).toBe('2026-10-25T05:00:00.000Z');
  });

  it('marks check-ins after the grace period as Late', () => {
    expect(statusForCheckIn(session.startsAt, 15, addisDateTime('2026-10-25', '08:15'))).toBe(
      'PRESENT',
    );
    expect(statusForCheckIn(session.startsAt, 15, addisDateTime('2026-10-25', '08:16'))).toBe(
      'LATE',
    );
  });

  it('marks check-ins past the absent cut-off as Absent', () => {
    const at = (t: string) => addisDateTime('2026-10-25', t);
    const rules = { absentAfterMinutes: 45 };
    expect(statusForCheckIn(session.startsAt, 15, at('08:10'), rules)).toBe('PRESENT');
    expect(statusForCheckIn(session.startsAt, 15, at('08:45'), rules)).toBe('LATE');
    expect(statusForCheckIn(session.startsAt, 15, at('08:46'), rules)).toBe('ABSENT');
  });

  it('lets a late permission keep a member Present for its grace and move their cut-off', () => {
    // Late after 15, absent after 45, a 30-minute permission.
    const at = (t: string) => addisDateTime('2026-10-25', t);
    const rules = { absentAfterMinutes: 45, graceMinutes: 30 };
    expect(statusForCheckIn(session.startsAt, 15, at('08:30'), rules)).toBe('PRESENT');
    expect(statusForCheckIn(session.startsAt, 15, at('08:31'), rules)).toBe('LATE');
    expect(statusForCheckIn(session.startsAt, 15, at('09:15'), rules)).toBe('LATE');
    expect(statusForCheckIn(session.startsAt, 15, at('09:16'), rules)).toBe('ABSENT');
    // A grace shorter than the session's own late time changes nothing.
    expect(statusForCheckIn(session.startsAt, 15, at('08:12'), { graceMinutes: 5 })).toBe(
      'PRESENT',
    );
  });

  it('closes at the end time, or at the absent cut-off held open for the longest grace', () => {
    expect(closesAt({ ...session, absentAfterMinutes: null })).toEqual(session.endsAt);
    expect(closesAt({ ...session, absentAfterMinutes: 45 })).toEqual(
      addisDateTime('2026-10-25', '08:45'),
    );
    expect(closesAt({ ...session, absentAfterMinutes: 45 }, 30)).toEqual(
      addisDateTime('2026-10-25', '09:15'),
    );
  });

  it('knows the weekday of a date', () => {
    expect(weekdayOf('2026-11-08')).toBe(0); // a Sunday
    expect(weekdayOf('2026-11-10')).toBe(2);
  });

  it('counts time attended from the check-in for late arrivals', () => {
    expect(minutesAttended({ status: 'PRESENT', checkedInAt: null }, session)).toBe(180);
    expect(
      minutesAttended(
        { status: 'LATE', checkedInAt: addisDateTime('2026-10-25', '09:30') },
        session,
      ),
    ).toBe(90);
    expect(minutesAttended({ status: 'LATE', checkedInAt: null }, session)).toBe(165);
    expect(minutesAttended({ status: 'ABSENT', checkedInAt: null }, session)).toBe(0);
    expect(minutesAttended({ status: 'EXCUSED', checkedInAt: null }, session)).toBe(0);
  });

  it('leaves excused sessions out of the rate', () => {
    expect(attendanceRate({ present: 6, late: 2, absent: 2, excused: 5 })).toBe(80);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 3 })).toBeNull();
    expect(attendanceRate({ present: 1, late: 0, absent: 2, excused: 0 })).toBe(33.3);
  });

  it('normalizes scanned or typed member codes', () => {
    expect(normalizeMemberCode(' fe-00042 ')).toBe('FE-00042');
    expect(normalizeMemberCode('42')).toBe('FE-00042');
    expect(normalizeMemberCode('FE42')).toBe('FE-00042');
    expect(normalizeMemberCode('FE-123456')).toBe('FE-123456');
    expect(normalizeMemberCode('hello')).toBe('HELLO');
  });
});
