import { ScrollText, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/use-auth'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuditLog, useAuditUsers } from '../api'
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditAction, type AuditEntry, type AuditQuery } from '../types'

const ALL = '__all__'

const ACTION_STYLES: Record<AuditAction, string> = {
  CREATE: 'bg-success/12 text-success',
  UPDATE: 'bg-accent text-accent-foreground',
  DELETE: 'bg-destructive/10 text-destructive',
  LOGIN: 'bg-muted text-muted-foreground',
  LOGOUT: 'bg-muted text-muted-foreground',
}

/** Where an audited record can be opened, if anywhere. */
const ROUTES: Partial<Record<string, (id: string) => string>> = {
  Member: (id) => `/members/${id}`,
  Department: (id) => `/departments/${id}`,
  AttendanceSession: (id) => `/attendance/${id}`,
}

/** A short, readable summary of the recorded changes. */
function useDetails() {
  const { t } = useTranslation()
  return (changes: unknown): string => {
    if (!changes || typeof changes !== 'object') return ''
    return Object.entries(changes as Record<string, unknown>)
      .map(([key, value]) => {
        if (key === 'fields' && Array.isArray(value)) return t('audit.changedFields', { fields: value.join(', ') })
        const shown = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)
        return `${key}: ${shown}`
      })
      .join(' · ')
  }
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  options: { value: string; label: string }[]
  allLabel: string
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="w-full sm:w-48" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const scoped = user?.departmentIds != null
  const [query, setQuery] = useState<AuditQuery>({ page: 1, pageSize: 25 })
  const log = useAuditLog(query)
  const { data: users } = useAuditUsers()
  const details = useDetails()
  const set = (patch: Partial<AuditQuery>) => setQuery((q) => ({ ...q, page: 1, ...patch }))
  const filtered = Boolean(query.userId || query.entity || query.action || query.from || query.to)
  const entityLabel = (e: string) => (AUDIT_ENTITIES.includes(e as never) ? t(`audit.entities.${e as (typeof AUDIT_ENTITIES)[number]}`) : e)

  const target = (e: AuditEntry) => {
    const label = `${entityLabel(e.entity)}${e.entityId ? ` #${e.entityId}` : ''}`
    const route = e.entityId && e.action !== 'DELETE' ? ROUTES[e.entity]?.(e.entityId) : undefined
    return route ? (
      <Link to={route} className="hover:underline">
        {label}
      </Link>
    ) : (
      label
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('audit.title')} description={scoped ? t('audit.descriptionScoped') : t('audit.description')} />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterSelect
          label={t('audit.who')}
          value={query.userId ? String(query.userId) : undefined}
          onChange={(v) => set({ userId: v ? Number(v) : undefined })}
          options={(users ?? []).map((u) => ({ value: String(u.id), label: u.fullName }))}
          allLabel={t('audit.allUsers')}
        />
        <FilterSelect
          label={t('audit.what')}
          value={query.entity}
          onChange={(v) => set({ entity: v })}
          options={AUDIT_ENTITIES.map((e) => ({ value: e, label: t(`audit.entities.${e}`) }))}
          allLabel={t('audit.allRecords')}
        />
        <FilterSelect
          label={t('audit.action')}
          value={query.action}
          onChange={(v) => set({ action: v })}
          options={AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`audit.actions.${a}`) }))}
          allLabel={t('audit.allActions')}
        />
        <EthDatePicker
          value={query.from ?? ''}
          onChange={(v) => set({ from: v || undefined })}
          clearable
          placeholder={t('audit.from')}
          className="sm:w-44"
        />
        <EthDatePicker
          value={query.to ?? ''}
          onChange={(v) => set({ to: v || undefined })}
          clearable
          placeholder={t('audit.to')}
          className="sm:w-44"
        />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setQuery({ page: 1, pageSize: query.pageSize })}>
            <X />
            {t('audit.clear')}
          </Button>
        )}
      </div>

      {log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : log.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : log.data.data.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? t('audit.noMatch') : t('audit.empty')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{t('audit.when')}</TableHead>
                  <TableHead>{t('audit.who')}</TableHead>
                  <TableHead>{t('audit.action')}</TableHead>
                  <TableHead>{t('audit.what')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('audit.details')}</TableHead>
                  <TableHead className="hidden pr-5 xl:table-cell">{t('audit.ip')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.data.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-5 text-sm whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell>
                      {e.user ? (
                        <>
                          <span className="block text-sm font-medium">{e.user.fullName}</span>
                          <span className="block text-xs text-muted-foreground">{e.user.email}</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t('audit.system')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
                          ACTION_STYLES[e.action] ?? 'bg-muted',
                        )}
                      >
                        {AUDIT_ACTIONS.includes(e.action) ? t(`audit.actions.${e.action}`) : e.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{target(e)}</TableCell>
                    <TableCell className="hidden max-w-md truncate text-xs text-muted-foreground lg:table-cell" title={details(e.changes)}>
                      {details(e.changes)}
                    </TableCell>
                    <TableCell className="hidden pr-5 font-mono text-xs text-muted-foreground xl:table-cell">
                      {e.ipAddress ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4">
            <PaginationBar
              meta={log.data.meta}
              onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
              onPageSizeChange={(pageSize) => set({ pageSize })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
