import { plainToInstance } from 'class-transformer';
import { normalizeEthiopianPhone, TrimLines } from './string.transforms.js';

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

describe('TrimLines', () => {
  class Rules {
    @TrimLines()
    text!: string;
  }

  it('keeps one rule per line and drops blank lines', () => {
    const { text } = plainToInstance(Rules, { text: '  first   rule \r\n\n second rule  \n' });
    expect(text).toBe('first rule\nsecond rule');
  });
});
