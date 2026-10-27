import vectors from './__fixtures__/ethiopian-calendar-vectors.json'
import {
  ecMonthBounds,
  ecToGcIso,
  ecYearBounds,
  formatEth,
  gcToEc,
  isEcLeap, ethDayPart, ethHour, formatEthTime, hour24FromEth } from './ethiopian-calendar'

// Golden vectors copied from DPMES (backend/project/core/tests/data), so this
// port behaves identically to the DPMES frontend and backend.
describe('golden vectors (from DPMES)', () => {
  it('converts dates both directions', () => {
    for (const v of vectors.dates) {
      const [year, month, day] = v.ec
      expect(gcToEc(v.gc)).toEqual({ year, month, day })
      expect(ecToGcIso(year!, month!, day!)).toBe(v.gc)
    }
  })

  it('knows leap years', () => {
    for (const y of vectors.leapYears.leap) expect(isEcLeap(y)).toBe(true)
    for (const y of vectors.leapYears.common) expect(isEcLeap(y)).toBe(false)
  })

  it('computes year and month bounds', () => {
    for (const v of vectors.yearBounds) expect(ecYearBounds(v.ec)).toEqual({ start: v.start, end: v.end })
    for (const v of vectors.monthBounds) {
      expect(ecMonthBounds(v.ec, v.month)).toEqual({ start: v.start, end: v.end })
    }
  })
})

describe('round trip', () => {
  it('maps every day 1990–2060 to a unique E.C. date and back', () => {
    const day = new Date(Date.UTC(1990, 0, 1))
    const end = Date.UTC(2060, 11, 31)
    for (; day.getTime() <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const iso = day.toISOString().slice(0, 10)
      const ec = gcToEc(iso)!
      expect(ecToGcIso(ec.year, ec.month, ec.day)).toBe(iso)
    }
  })
})

describe('formatEth', () => {
  it('formats DATE columns by their calendar date, ignoring the UTC time', () => {
    // 2026-10-26 G.C. = Tikimt 16, 2019 E.C.
    expect(formatEth('2026-10-26T00:00:00.000Z')).toBe('Tikimt 16, 2019')
    expect(formatEth('2026-10-26', 'date', 'am')).toBe('ጥቅምት 16 ቀን 2019 ዓ.ም')
  })

  it('formats month and year styles', () => {
    expect(formatEth('2026-10-26', 'month')).toBe('Tikimt 2019')
    expect(formatEth('2026-10-26', 'year', 'am')).toBe('2019 ዓ.ም')
  })

  it('falls back to the raw value when unparseable', () => {
    expect(formatEth('not-a-date')).toBe('not-a-date')
  })
})

describe('Ethiopian time', () => {
  it.each([
    ['07:00', 'ቀን 1:00', '1:00 day'],
    ['08:30', 'ቀን 2:30', '2:30 day'],
    ['12:00', 'ቀን 6:00', '6:00 day'],
    ['18:00', 'ቀን 12:00', '12:00 day'],
    ['19:00', 'ማታ 1:00', '1:00 night'],
    ['00:00', 'ማታ 6:00', '6:00 night'],
    ['06:00', 'ማታ 12:00', '12:00 night'],
  ])('%s → %s', (hhmm, am, en) => {
    expect(formatEthTime(hhmm, 'am')).toBe(am)
    expect(formatEthTime(hhmm, 'en')).toBe(en)
  })

  it('converts every Ethiopian hour back to the same 24-hour hour', () => {
    for (let h = 0; h < 24; h++) expect(hour24FromEth(ethDayPart(h), ethHour(h))).toBe(h)
  })
})
