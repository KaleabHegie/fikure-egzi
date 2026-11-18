import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { assertDay, dayAccess } from '../../modules/attendance/attendance.service.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';
import { editableUntil, withinEditWindow } from './edit-window.js';

const user = (permissions: string[], more: Partial<AuthenticatedUser> = {}) =>
  ({ id: 1, departmentIds: [4], inOffice: false, permissions, ...more }) as AuthenticatedUser;

describe('edit window', () => {
  it('runs through the 5th day after the day', () => {
    expect(editableUntil('2026-11-19')).toBe('2026-11-24');
    expect(editableUntil('2026-12-29')).toBe('2027-01-03');
    // 24 Nov 23:30 in Addis is still the 24th; 25 Nov is closed.
    expect(withinEditWindow('2026-11-19', new Date('2026-11-24T20:30:00Z'))).toBe(true);
    expect(withinEditWindow('2026-11-19', new Date('2026-11-24T21:30:00Z'))).toBe(false);
    // Days still to come are open.
    expect(withinEditWindow('2026-12-01', new Date('2026-11-24T09:00:00Z'))).toBe(true);
  });
});

describe('attendance day access', () => {
  const taker = user(['attendance.take', 'attendance.manage']);
  const attendanceAdmin = user(['attendance.manage', 'attendance.any_day']);
  const head = user(['attendance.manage', 'attendance.any_day', 'attendance.override']);
  const secretariat = user(['attendance.manage', 'attendance.any_day'], { inOffice: true });
  const officeAdmin = user(['attendance.any_day'], { departmentIds: null });

  it('gives each role its days', () => {
    expect(dayAccess(taker)).toBe('today');
    expect(dayAccess(attendanceAdmin)).toBe('recent');
    expect(dayAccess(head)).toBe('any');
    expect(dayAccess(secretariat)).toBe('any');
    expect(dayAccess(officeAdmin)).toBe('any');
  });

  it('closes a session to attendance admins after the 5th day', () => {
    jest.useFakeTimers({ now: new Date('2026-11-24T09:00:00Z'), doNotFake: ['nextTick'] });
    try {
      expect(() => assertDay('2026-11-19', 'recent')).not.toThrow();
      expect(() => assertDay('2026-11-18', 'recent')).toThrow(ForbiddenException);
      expect(() => assertDay('2026-11-18', 'any')).not.toThrow();
      // Attendance takers are unchanged: today only.
      expect(() => assertDay('2026-11-24', 'today')).not.toThrow();
      expect(() => assertDay('2026-11-23', 'today')).toThrow(ForbiddenException);
    } finally {
      jest.useRealTimers();
    }
  });
});
