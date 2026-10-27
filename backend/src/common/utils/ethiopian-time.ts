/*
 * The Ethiopian clock (same as the web app): two halves each counted 1–12 —
 * day (ቀን) 1 = 07:00 … 12 = 18:00, night (ማታ) 1 = 19:00 … 12 = 06:00.
 * Stored times stay 24-hour "HH:mm"; this is only for reading and writing
 * what people see.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export type EthPart = 'day' | 'night';
const LABELS = { am: { day: 'ቀን', night: 'ማታ' }, en: { day: 'day', night: 'night' } } as const;

export const ethHour = (hour24: number) => (hour24 + 6) % 12 || 12;
export const ethPart = (hour24: number): EthPart => (hour24 >= 7 && hour24 <= 18 ? 'day' : 'night');
export const hour24FromEth = (part: EthPart, hour: number) =>
  part === 'day' ? 6 + hour : (18 + hour) % 24;

/** "08:00" → "ቀን 2:00" / "2:00 day". */
export function formatEthTime(hhmm: string, lang: 'am' | 'en'): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const clock = `${ethHour(h)}:${pad(m)}`;
  const part = LABELS[lang][ethPart(h)];
  return lang === 'am' ? `${part} ${clock}` : `${clock} ${part}`;
}

const PART_WORDS: Record<string, EthPart> = {
  ቀን: 'day',
  day: 'day',
  ማታ: 'night',
  ሌሊት: 'night',
  night: 'night',
};

/**
 * Reads an Ethiopian-clock time in either language and order — "ቀን 2:00",
 * "2:30 ማታ", "day 2", "2:00 night" — and returns 24-hour "HH:mm", or null.
 */
export function parseEthTime(text: string): string | null {
  const words = text.trim().toLowerCase().split(/\s+/);
  if (words.length !== 2) return null;
  const [a, b] = words as [string, string];
  const part = PART_WORDS[a] ?? PART_WORDS[b];
  const clock = PART_WORDS[a] ? b : a;
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(clock);
  if (!part || !m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return `${pad(hour24FromEth(part, hour))}:${pad(minute)}`;
}
