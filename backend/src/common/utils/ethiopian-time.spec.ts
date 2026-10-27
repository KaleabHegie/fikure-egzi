import { formatEthTime, parseEthTime } from './ethiopian-time.js';

describe('Ethiopian time', () => {
  it.each([
    ['07:00', 'ቀን 1:00', '1:00 day'],
    ['08:30', 'ቀን 2:30', '2:30 day'],
    ['18:00', 'ቀን 12:00', '12:00 day'],
    ['19:15', 'ማታ 1:15', '1:15 night'],
    ['00:00', 'ማታ 6:00', '6:00 night'],
    ['06:00', 'ማታ 12:00', '12:00 night'],
  ])('%s ⇄ %s', (hhmm, am, en) => {
    expect(formatEthTime(hhmm, 'am')).toBe(am);
    expect(formatEthTime(hhmm, 'en')).toBe(en);
    expect(parseEthTime(am)).toBe(hhmm);
    expect(parseEthTime(en)).toBe(hhmm);
  });

  it('accepts loose spellings and rejects nonsense', () => {
    expect(parseEthTime('day 2')).toBe('08:00');
    expect(parseEthTime('  ማታ   3:05 ')).toBe('21:05');
    expect(parseEthTime('ሌሊት 6:00')).toBe('00:00');
    expect(parseEthTime('08:00')).toBeNull();
    expect(parseEthTime('ቀን 13:00')).toBeNull();
    expect(parseEthTime('noon 2')).toBeNull();
  });
});
