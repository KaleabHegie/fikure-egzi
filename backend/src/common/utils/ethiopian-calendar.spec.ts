import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecToGcIso, formatEcDate, gcIsoToEc, parseEcDate } from './ethiopian-calendar.js';

const vectors = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/common/utils/__fixtures__/ethiopian-calendar-vectors.json'),
    'utf8',
  ),
) as { dates: { gc: string; ec: [number, number, number] }[] };

describe('ethiopian calendar (API)', () => {
  it('matches the shared DPMES golden vectors both ways', () => {
    for (const { gc, ec } of vectors.dates) {
      expect(ecToGcIso(...ec)).toBe(gc);
      expect(gcIsoToEc(gc)).toEqual({ year: ec[0], month: ec[1], day: ec[2] });
    }
  });

  it('parses typed dd/mm/yyyy E.C. dates and rejects impossible ones', () => {
    expect(parseEcDate('01/01/2019')).toBe('2026-09-11');
    expect(parseEcDate(' 16-2-2019 ')).toBe('2026-10-26');
    expect(parseEcDate('06/13/2018')).toBeNull(); // 2018 is not a leap year: Pagume has 5 days
    expect(parseEcDate('06/13/2019')).toBe('2027-09-11'); // 2019 is (year % 4 === 3)
    expect(parseEcDate('31/01/2019')).toBeNull();
    expect(parseEcDate('2019-01-01')).toBeNull();
  });

  it('formats Gregorian dates as E.C. text', () => {
    expect(formatEcDate('2026-10-26')).toBe('16/02/2019');
  });
});
