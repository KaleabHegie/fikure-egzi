import {
  addisDateTime,
  attendanceRate,
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
