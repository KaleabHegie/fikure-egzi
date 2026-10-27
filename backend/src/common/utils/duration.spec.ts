import { parseDurationToSeconds } from './duration.js';

describe('parseDurationToSeconds', () => {
  it.each([
    ['900s', 900],
    ['15m', 900],
    ['1h', 3600],
    ['7d', 604800],
  ])('parses %s', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it('rejects malformed input', () => {
    expect(() => parseDurationToSeconds('15 minutes')).toThrow();
  });
});
