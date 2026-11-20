import { useTranslation } from 'react-i18next'
import { formatDate, formatDateTime } from '@/lib/format'
import { AUDIT_ENTITIES, type AuditAction, type AuditDetail } from './types'

export const ACTION_STYLES: Record<AuditAction, string> = {
  CREATE: 'bg-success/12 text-success',
  UPDATE: 'bg-accent text-accent-foreground',
  DELETE: 'bg-destructive/10 text-destructive',
  LOGIN: 'bg-muted text-muted-foreground',
  LOGOUT: 'bg-muted text-muted-foreground',
}

/** Where an audited record can be opened, if anywhere. */
export const ROUTES: Partial<Record<string, (id: string) => string>> = {
  Member: (id) => `/members/${id}`,
  Department: (id) => `/departments/${id}`,
  AttendanceSession: (id) => `/attendance/${id}`,
  Exam: (id) => `/exams/${id}`,
  Course: (id) => `/courses/${id}`,
  Asset: (id) => `/assets/${id}`,
}

/** The page whose form names a record's fields, for labels like "phone" → "ስልክ". */
const ENTITY_FIELDS: Partial<Record<string, string>> = {
  Member: 'members',
  User: 'users',
  Department: 'departments',
  DepartmentMembership: 'departments',
  AttendanceSession: 'attendance',
  LatePermission: 'attendance.permissions',
  ServiceGroup: 'serviceGroups',
  ServiceTerm: 'serviceGroups',
  ClassType: 'classes',
  ClassGrade: 'classes',
  ClassAgreement: 'classes',
  Exam: 'exams',
  Course: 'courses',
  CourseOffering: 'courses',
  Asset: 'assets',
  AssetCategory: 'assets',
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const MIDNIGHT = /T00:00:00(\.000)?Z$/

/** Labels and value formatting shared by the audit list and an entry's page. */
export function useAuditFormat() {
  const { t, i18n } = useTranslation()
  const en = i18n.language === 'en'
  const text = (key: string) => {
    if (!i18n.exists(key)) return null
    const v = t(key as never) as unknown
    return typeof v === 'string' ? v : null
  }
  const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

  const entity = (e: string) => (AUDIT_ENTITIES.includes(e as never) ? t(`audit.entities.${e as (typeof AUDIT_ENTITIES)[number]}`) : e)

  /** "phone" → "ስልክ": the audit's own labels, then the record's form, then the member form, else the key in words. */
  const field = (key: string, ofEntity?: string) => {
    const ns = ofEntity ? ENTITY_FIELDS[ofEntity] : undefined
    return text(`audit.fields.${key}`) ?? (ns && text(`${ns}.fields.${key}`)) ?? text(`members.fields.${key}`) ?? humanize(key)
  }

  /** One recorded value in words: names for ids, E.C. dates, yes/no, '—' for nothing. */
  const value = (raw: unknown, key: string, entry?: Pick<AuditDetail, 'refs' | 'entity'>): string => {
    if (raw === null || raw === undefined) return '—'
    if (raw === '') return t('audit.entry.empty')
    if (Array.isArray(raw)) return raw.length === 0 ? '—' : raw.map((x) => value(x, key, entry)).join(en ? ', ' : '፣ ')
    if (typeof raw === 'boolean') return raw ? t('audit.entry.yes') : t('audit.entry.no')
    if (typeof raw === 'number') {
      const ref = entry?.refs?.[key]?.[String(raw)]
      return ref ? (en ? ref.en : ref.am) : String(raw)
    }
    if (typeof raw === 'string') {
      if (ISO_TIME.test(raw)) return MIDNIGHT.test(raw) ? formatDate(raw) : formatDateTime(raw)
      if (ISO_DAY.test(raw)) return formatDate(`${raw}T00:00:00.000Z`)
      // Enum values the record's page already names, e.g. gender MALE → ወንድ.
      const ns = entry ? ENTITY_FIELDS[entry.entity] : undefined
      if (/^[A-Z][A-Z_]+$/.test(raw)) {
        for (const k of [ns && `${ns}.${key}.${raw}`, ns && `${ns}.${key}s.${raw}`, `members.${key}.${raw}`, `audit.actions.${raw}`]) {
          const label = k ? text(k) : null
          if (label) return label
        }
      }
      return raw
    }
    return JSON.stringify(raw)
  }

  return { entity, field, value }
}
