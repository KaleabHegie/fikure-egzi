const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** Parses "900s" | "15m" | "1h" | "7d" into seconds. */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Invalid duration "${value}"`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_SECONDS[unit as keyof typeof UNIT_SECONDS];
}
