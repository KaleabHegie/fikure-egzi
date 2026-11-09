import type { ExamPart, ExamPartInput } from './types'

export interface PartRow {
  key: string
  id?: number
  name: string
  weight: string
}

let next = 0
export const blankPart = (name = '', weight = ''): PartRow => ({ key: `n${next++}`, name, weight })
export const toPartRows = (parts: ExamPart[]): PartRow[] =>
  parts.map((p) => ({ key: `p${p.id}`, id: p.id, name: p.name, weight: String(p.weight) }))

const WEIGHT = /^\d{1,3}(\.\d{1,2})?$/
export const partsTotal = (rows: PartRow[]) =>
  Math.round(rows.reduce((sum, r) => sum + (WEIGHT.test(r.weight) ? Number(r.weight) : 0), 0) * 100) / 100

/** The first problem with the rows (as a translation key + params), or null when they can be saved. */
export function partsProblem(rows: PartRow[]): { key: string; params?: Record<string, unknown> } | null {
  if (rows.some((r) => !r.name.trim())) return { key: 'exams.parts.nameRequired' }
  if (rows.some((r) => !WEIGHT.test(r.weight) || Number(r.weight) <= 0)) return { key: 'exams.parts.weightInvalid' }
  const names = rows.map((r) => r.name.trim().toLowerCase())
  if (new Set(names).size !== names.length) return { key: 'exams.duplicatePart' }
  const total = partsTotal(rows)
  if (total > 100) return { key: 'exams.totalOver', params: { total } }
  return null
}

export const toPartInputs = (rows: PartRow[]): ExamPartInput[] =>
  rows.map((r) => ({ ...(r.id !== undefined && { id: r.id }), name: r.name.trim(), weight: Number(r.weight) }))
