import { http } from '@/lib/api/client'
import type { SessionKind } from './types'

export type ImportIssueCode =
  | 'required'
  | 'invalidOption'
  | 'invalidDate'
  | 'dateAsNumber'
  | 'futureDate'
  | 'invalidTime'
  | 'endBeforeStart'
  | 'unknownMember'
  | 'duplicateMember'
  | 'onlyPresent'
  | 'notYourDepartment'
  | 'invalidNumber'
  | 'tooLong'
  | 'overlap'
  | 'overlapInFile'
  | 'invalid'

export interface ImportRowIssues {
  row: number
  errors: { column: string; code: ImportIssueCode; params?: Record<string, string | number> }[]
}

export interface SheetPreview {
  totalRows: number
  toSave: number
  errorRows: number
  rows: ImportRowIssues[]
}

/** A session list: one session per row, like the "New session" form. */
export interface AttendanceImportPreview {
  totalRows: number
  errorRows: number
  sessions: {
    row: number
    date: string
    kind: SessionKind
    title: string
    start: string
    end: string
    /** Already in the system: skipped. */
    existing: boolean
  }[]
  rows: ImportRowIssues[]
}

const upload = <T>(method: 'post' | 'put', url: string, file: File, params?: object) => {
  const body = new FormData()
  body.append('file', file)
  return http[method]<{ data: T }>(url, body, {
    params,
    headers: { 'Content-Type': undefined },
    // Big files are checked and saved in one go.
    timeout: 300_000,
  }).then((r) => r.data.data)
}

const blob = (url: string, lang: 'am' | 'en') =>
  http.get<Blob>(url, { params: { lang }, responseType: 'blob' }).then((r) => r.data)

export const attendanceImportApi = {
  /** A session's roster as an Excel sheet with a status dropdown. */
  sheet: (id: number, lang: 'am' | 'en') => blob(`/attendance/sessions/${id}/sheet`, lang),
  previewSheet: (id: number, file: File) => upload<SheetPreview>('post', `/attendance/sessions/${id}/sheet/preview`, file),
  saveSheet: (id: number, file: File) => upload<{ saved: number }>('put', `/attendance/sessions/${id}/sheet`, file),
  /** Template for creating many sessions at once. */
  template: (lang: 'am' | 'en') => blob('/attendance/import/template', lang),
  preview: (file: File, lang: 'am' | 'en') =>
    upload<AttendanceImportPreview>('post', '/attendance/import/preview', file, { lang }),
  commit: (file: File, lang: 'am' | 'en') =>
    upload<{ created: number; skipped: number }>('post', '/attendance/import', file, { lang }),
}
