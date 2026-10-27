import { Transform } from 'class-transformer';

/** Trims surrounding whitespace and collapses internal runs of spaces. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  );

/**
 * For optional fields: trims, and turns an empty string into `null` so a
 * cleared form field clears the column on PATCH.
 */
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return trimmed === '' ? null : trimmed;
  });

export const LowerCase = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  );

/**
 * Normalizes Ethiopian phone numbers to the local 10-digit form (09XXXXXXXX /
 * 07XXXXXXXX) so the same number always matches in search. Empty → null.
 */
export function normalizeEthiopianPhone(value: string): string {
  const compact = value.replace(/[\s\-().]/g, '');
  if (compact.startsWith('+251')) return `0${compact.slice(4)}`;
  if (compact.startsWith('251') && compact.length === 12) return `0${compact.slice(3)}`;
  return compact;
}

export const NormalizePhone = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const normalized = normalizeEthiopianPhone(value);
    return normalized === '' ? null : normalized;
  });

export const ETHIOPIAN_PHONE_REGEX = /^0[79]\d{8}$/;
