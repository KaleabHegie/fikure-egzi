import { ArrowRight, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuditEntry } from '../api'
import { ACTION_STYLES, ROUTES, useAuditFormat } from '../format'
import { AUDIT_ACTIONS, type AuditDetail, type AuditFieldChange } from '../types'

type Changes = Record<string, unknown>
const isObject = (v: unknown): v is Changes => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A titled card. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <h2 className="border-b px-4 py-3 text-sm font-semibold sm:px-5">{title}</h2>
      {children}
    </section>
  )
}

/** Field → value rows (a created or deleted record, or other recorded details). */
function Values({ values, entry }: { values: Changes; entry: AuditDetail }) {
  const { field, value } = useAuditFormat()
  return (
    <dl className="divide-y">
      {/* The record's own id is already in the summary. */}
      {Object.entries(values)
        .filter(([key]) => key !== 'id')
        .map(([key, v]) => (
        <div key={key} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[14rem_1fr] sm:gap-4 sm:px-5">
          <dt className="text-sm text-muted-foreground">{field(key, entry.entity)}</dt>
          <dd className="text-sm break-words whitespace-pre-line">{value(v, key, entry)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Field · before → after, one row per changed field. */
function Diff({ diff, entry }: { diff: Record<string, AuditFieldChange>; entry: AuditDetail }) {
  const { t } = useTranslation()
  const { field, value } = useAuditFormat()
  return (
    <div>
      <div className="hidden border-b px-5 py-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[14rem_1fr_1.25rem_1fr] sm:gap-4">
        <span>{t('audit.entry.field')}</span>
        <span>{t('audit.entry.before')}</span>
        <span />
        <span>{t('audit.entry.after')}</span>
      </div>
      <ul className="divide-y">
        {Object.entries(diff).map(([key, change]) => (
          <li key={key} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[14rem_1fr_1.25rem_1fr] sm:items-start sm:gap-4 sm:px-5">
            <span className="text-sm font-medium">{field(key, entry.entity)}</span>
            <span className="rounded-md bg-destructive/8 px-2 py-1 text-sm break-words whitespace-pre-line text-foreground/80">
              <span className="mr-1.5 text-[11px] text-muted-foreground sm:hidden">{t('audit.entry.before')}:</span>
              {'from' in change ? (
                value(change.from, key, entry)
              ) : (
                <span className="text-muted-foreground italic">{t('audit.entry.notRecorded')}</span>
              )}
            </span>
            <ArrowRight className="mt-1.5 hidden size-4 text-muted-foreground sm:block" aria-hidden />
            <span className="rounded-md bg-success/10 px-2 py-1 text-sm font-medium break-words whitespace-pre-line">
              <span className="mr-1.5 text-[11px] font-normal text-muted-foreground sm:hidden">{t('audit.entry.after')}:</span>
              {value(change.to, key, entry)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One audit entry in full: who, when, from where, about what, and every value recorded. */
export function AuditEntryPage() {
  const { t, i18n } = useTranslation()
  const id = useParams().id ?? ''
  const { state } = useLocation() as { state: { from?: string } | null }
  const entry = useAuditEntry(id)
  const { entity, field } = useAuditFormat()

  if (entry.isError) return <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />
  if (entry.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  const e = entry.data
  const changes: Changes = isObject(e.changes) ? e.changes : {}
  const diff = isObject(changes.diff) ? (changes.diff as Record<string, AuditFieldChange>) : null
  const before = isObject(changes.before) ? changes.before : null
  const after = isObject(changes.after) ? changes.after : null
  const fields = Array.isArray(changes.fields) ? changes.fields.map(String) : []
  const other = Object.fromEntries(Object.entries(changes).filter(([k]) => !['diff', 'before', 'after', 'fields'].includes(k)))
  // Entries from before values were kept: only the names of the changed fields.
  const oldStyle = !diff && fields.length > 0
  const name = e.target ? (i18n.language === 'en' ? e.target.en : e.target.am) : null
  const route = e.entityId && e.action !== 'DELETE' ? ROUTES[e.entity]?.(e.entityId) : undefined
  const action = AUDIT_ACTIONS.includes(e.action) ? t(`audit.actions.${e.action}`) : e.action

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ to: state?.from ?? '/audit', label: t('audit.title') }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex h-7 items-center rounded-full px-3 text-sm font-medium', ACTION_STYLES[e.action] ?? 'bg-muted')}>
              {action}
            </span>
            <span>{name ?? `${entity(e.entity)}${e.entityId ? ` #${e.entityId}` : ''}`}</span>
          </span>
        }
        description={formatDateTime(e.createdAt)}
        className="mb-2"
      />

      <Section title={t('audit.entry.summary')}>
        <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <dt className="text-xs text-muted-foreground">{t('audit.who')}</dt>
            <dd className="text-sm font-medium">{e.user?.fullName ?? t('audit.system')}</dd>
            {e.user && <dd className="text-xs text-muted-foreground">{e.user.email}</dd>}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('audit.when')}</dt>
            <dd className="text-sm">{formatDateTime(e.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('audit.entry.record')}</dt>
            <dd className="text-sm font-medium">
              {route ? (
                <Link to={route} className="text-primary hover:underline">
                  {name ?? `${entity(e.entity)} #${e.entityId}`}
                </Link>
              ) : (
                (name ?? (e.entityId ? `#${e.entityId}` : '—'))
              )}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {entity(e.entity)}
              {e.target?.code && <span className="tabular"> · {e.target.code}</span>}
              {e.entityId && !name && e.action === 'DELETE' && ` · ${t('audit.entry.deletedRecord')}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('audit.ip')}</dt>
            <dd className="font-mono text-sm">{e.ipAddress ?? '—'}</dd>
            <dd className="text-xs text-muted-foreground">
              {t('audit.entry.entryId')} #{e.id}
            </dd>
          </div>
        </dl>
      </Section>

      {diff && Object.keys(diff).length > 0 && (
        <Section title={t('audit.entry.changes')}>
          <Diff diff={diff} entry={e} />
        </Section>
      )}
      {oldStyle && (
        <Section title={t('audit.entry.changes')}>
          <div className="space-y-2 p-4 sm:p-5">
            <p className="text-sm">{fields.map((f) => field(f, e.entity)).join(i18n.language === 'en' ? ', ' : '፣ ')}</p>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('audit.entry.oldEntry')}
            </p>
          </div>
        </Section>
      )}
      {after && Object.keys(after).length > 0 && (
        <Section title={t('audit.entry.created')}>
          <Values values={after} entry={e} />
        </Section>
      )}
      {before && Object.keys(before).length > 0 && (
        <Section title={t('audit.entry.deleted')}>
          <Values values={before} entry={e} />
        </Section>
      )}
      {Object.keys(other).length > 0 && (
        <Section title={t('audit.entry.other')}>
          <Values values={other} entry={e} />
        </Section>
      )}
      {!diff && !oldStyle && !after && !before && Object.keys(other).length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t('audit.entry.nothing')}</p>
      )}
    </div>
  )
}
