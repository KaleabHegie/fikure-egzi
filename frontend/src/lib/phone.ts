/** Same normalization as the API (backend string.transforms.ts). */
export function normalizeEthiopianPhone(value: string): string {
  const compact = value.replace(/[\s\-().]/g, '')
  if (compact.startsWith('+251')) return `0${compact.slice(4)}`
  if (compact.startsWith('251') && compact.length === 12) return `0${compact.slice(3)}`
  return compact
}

export const PHONE_PATTERN = /^0[79]\d{8}$/

/** 0911223344 → 0911 22 33 44 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  return /^\d{10}$/.test(value) ? `${value.slice(0, 4)} ${value.slice(4, 6)} ${value.slice(6, 8)} ${value.slice(8)}` : value
}
