import { todayIso } from './dates.js';

describe('todayIso', () => {
  it('uses Addis Ababa time (UTC+3), not UTC', () => {
    // 22:30 UTC on 10 Sep is already 11 Sep (Ethiopian new year) in Addis Ababa.
    expect(todayIso(new Date('2026-09-10T22:30:00Z'))).toBe('2026-09-11');
    expect(todayIso(new Date('2026-09-10T20:59:00Z'))).toBe('2026-09-10');
  });
});
