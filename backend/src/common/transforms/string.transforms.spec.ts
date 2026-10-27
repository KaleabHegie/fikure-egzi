import { normalizeEthiopianPhone } from './string.transforms.js';

describe('normalizeEthiopianPhone', () => {
  it.each([
    ['+251911223344', '0911223344'],
    ['251911223344', '0911223344'],
    ['0911 22 33 44', '0911223344'],
    ['0711-223-344', '0711223344'],
    ['0911223344', '0911223344'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeEthiopianPhone(input)).toBe(expected);
  });
});
