import { addisDate, addisTime, formatDuration, sessionDate, sessionTimes } from './time'

const t = ((key: string, o: { h: number; m: number }) =>
  key === 'attendance.hoursMinutes' ? `${o.h} h ${o.m} min` : `${o.m} min`) as Parameters<typeof formatDuration>[1]

describe('session time helpers', () => {
  it('read instants as Addis Ababa wall-clock time, whatever the browser time zone', () => {
    // 05:00 UTC = 08:00 in Addis Ababa.
    expect(addisTime('2026-10-25T05:00:00.000Z')).toBe('08:00')
    // 22:30 UTC on the 25th is already 01:30 on the 26th in Addis Ababa.
    expect(addisDate('2026-10-25T22:30:00.000Z')).toBe('2026-10-26')
    // Shown on the Ethiopian clock: 08:00 → day 2:00.
    expect(sessionTimes('2026-10-25T05:00:00.000Z', '2026-10-25T08:00:00.000Z')).toBe(
      '2:00 day – 5:00 day',
    )
  })

  it('shows the session day in the Ethiopian calendar', () => {
    expect(sessionDate('2026-10-26T05:00:00.000Z')).toBe('Tikimt 16, 2019')
  })

  it('formats time attended', () => {
    expect(formatDuration(135, t)).toBe('2 h 15 min')
    expect(formatDuration(45, t)).toBe('45 min')
  })
})
