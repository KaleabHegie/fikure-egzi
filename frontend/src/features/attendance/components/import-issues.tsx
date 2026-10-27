import { useTranslation } from 'react-i18next'
import type { ProblemRow } from '@/components/import/import-steps'
import type { ImportRowIssues } from '../import-api'

/** Attendance import problems as rows for the shared ProblemsTable, in the UI language. */
export function useProblemRows() {
  const { t } = useTranslation()
  // Keys are dynamic but always exist in the locale files (attendance.import.*).
  const tr = t as unknown as (key: string, options?: Record<string, unknown>) => string
  return (rows: ImportRowIssues[]): ProblemRow[] =>
    rows.map((r) => ({
      row: r.row,
      errors: r.errors.map(
        (e) => `${tr(`attendance.import.columns.${e.column}`)}: ${tr(`attendance.import.issues.${e.code}`, e.params)}`,
      ),
    }))
}
