import type { ExamCandidateRow, ExamPart } from './types'

/** Which candidates the mark sheet shows; picked from the figures above it. */
export type ExamFilter = 'all' | 'unmarked' | 'marked' | 'passed' | 'failed'

/** Every part has a saved mark. */
export const fullyMarked = (c: ExamCandidateRow, parts: Pick<ExamPart, 'id'>[]) =>
  parts.length > 0 && parts.every((p) => p.id in c.marks)

export function matchesFilter(c: ExamCandidateRow, parts: Pick<ExamPart, 'id'>[], filter: ExamFilter) {
  switch (filter) {
    case 'all':
      return true
    case 'unmarked':
      return !fullyMarked(c, parts)
    case 'marked':
      return fullyMarked(c, parts)
    case 'passed':
      return c.result === 'PASS'
    case 'failed':
      return c.result === 'FAIL'
  }
}
