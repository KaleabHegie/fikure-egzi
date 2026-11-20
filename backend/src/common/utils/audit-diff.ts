import type { Prisma } from '../../generated/prisma/client.js';

/** Never written to the audit trail, whatever the record holds. */
const SECRET = /password|token|secret|hash/i;

/** Bookkeeping columns that say nothing about the change itself. */
const BOOKKEEPING = new Set(['createdAt', 'updatedAt', 'createdById', 'updatedById', 'deletedAt']);

type Json = Prisma.InputJsonValue | null;

/** One field's change: `from` is left out when the old value isn't a column (e.g. a list of links). */
// A type alias (not an interface) so it fits Prisma's JSON input type, whose objects are index signatures.
export type AuditFieldChange = {
  from?: Json;
  to: Json;
};

const isDecimal = (v: object): v is { toNumber(): number } =>
  'toNumber' in v && typeof (v as { toNumber: unknown }).toNumber === 'function';

/** A value as it is kept in the audit trail: plain JSON (dates as ISO text, decimals as numbers). */
export function auditValue(v: unknown, depth = 0): Json {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v !== 'object') return String(v);
  if (isDecimal(v)) return v.toNumber();
  if (depth > 2) return null;
  if (Array.isArray(v)) return v.map((x) => auditValue(x, depth + 1));
  const out: Record<string, Json> = {};
  for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) out[k] = auditValue(x, depth + 1);
  return out;
}

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What an update changed: for each field sent in `dto`, its value before and
 * after (from the record read before and the record returned by the update).
 * Unchanged fields are left out; a field the records don't hold as a column
 * keeps only its new value. Pass the result as the entry's `changes`, with
 * anything else worth noting.
 */
export function auditDiff(
  before: object | null | undefined,
  after: object | null | undefined,
  dto: object,
): { fields: string[]; diff: Record<string, AuditFieldChange> } {
  const diff: Record<string, AuditFieldChange> = {};
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  for (const [key, sent] of Object.entries(dto)) {
    if (sent === undefined || SECRET.test(key)) continue;
    if (key in b && key in a) {
      const from = auditValue(b[key]);
      const to = auditValue(a[key]);
      if (!same(from, to)) diff[key] = { from, to };
    } else if (key in b) {
      const from = auditValue(b[key]);
      const to = auditValue(sent);
      if (!same(from, to)) diff[key] = { from, to };
    } else {
      diff[key] = { to: auditValue(sent) };
    }
  }
  return { fields: Object.keys(diff), diff: diff as Record<string, AuditFieldChange> };
}

/**
 * The record's own values (no links to other records, no secrets, no
 * bookkeeping), kept with a CREATE or DELETE so the entry shows what was
 * created or what was lost.
 */
export function auditSnapshot(
  record: object | null | undefined,
  omit: string[] = [],
): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, v] of Object.entries(record ?? {})) {
    // Storage paths (photoPath, evidencePath) are internal file names, not something a reader can use.
    if (SECRET.test(key) || BOOKKEEPING.has(key) || key.endsWith('Path') || omit.includes(key))
      continue;
    if (v === null || v === undefined || v === '') continue;
    const plain = v instanceof Date || typeof v !== 'object' || isDecimal(v as object);
    const listOfPlain = Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');
    if (plain || listOfPlain) out[key] = auditValue(v);
  }
  return out;
}
