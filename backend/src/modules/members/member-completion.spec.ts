import { COMPLETION_FIELDS, memberCompletion, type CompletionSource } from './member-completion.js';

const empty = Object.fromEntries(COMPLETION_FIELDS.map((f) => [f, null])) as CompletionSource;
const full = Object.fromEntries(COMPLETION_FIELDS.map((f) => [f, 'x'])) as CompletionSource;

describe('memberCompletion', () => {
  it('is 100 with every field filled in', () => {
    expect(memberCompletion(full)).toEqual({ percent: 100, missing: [] });
  });

  it('is 0 with nothing filled in, and names the photo `photo`', () => {
    const result = memberCompletion(empty);
    expect(result.percent).toBe(0);
    expect(result.missing).toHaveLength(COMPLETION_FIELDS.length);
    expect(result.missing).toContain('photo');
    expect(result.missing).not.toContain('photoPath');
  });

  it('treats blank text as missing and rounds down', () => {
    const result = memberCompletion({ ...full, phone: '  ', photoPath: null });
    expect(result.missing).toEqual(['phone', 'photo']);
    expect(result.percent).toBe(Math.floor((15 / 17) * 100));
  });

  it('counts a date or a false-y but present value as filled', () => {
    expect(memberCompletion({ ...full, dateOfBirth: new Date('2000-01-01') }).percent).toBe(100);
  });
});
