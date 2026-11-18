import { ArrowLeft, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { PrintButton, PrintHeader } from '@/components/common/print'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { formatPhone } from '@/lib/phone'
import { useMemberLabels } from '../labels'
import { useMemberListParams } from '../use-member-list-params'
import { usePrintMembers } from '../use-print-members'
import { memberFullName } from '../utils'

/**
 * The member list on paper (or as a PDF): every member matching the list's
 * filters, not just the page on screen, sorted by member ID.
 */
export function MemberListPrintPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const labels = useMemberLabels()
  const { params, hasFilters } = useMemberListParams()
  const { data, isPending, isError, error, refetch } = usePrintMembers()

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  const title = t('members.listPrint.title')
  const cell = 'border border-neutral-400 px-2 py-1 align-top'

  return (
    <div className="min-h-svh bg-muted/40 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur sm:px-6">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/members${search}`}>
            <ArrowLeft />
            {t('nav.members')}
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {isPending ? t('members.listPrint.loading') : t('members.listPrint.count', { count: data.length })}
          </p>
        </div>
        <PrintButton variant="default" name={title} disabled={isPending || data.length === 0} />
      </div>

      {isPending ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('members.listPrint.loading')}
        </p>
      ) : (
        // On screen: a white sheet to preview; on paper: just the sheet.
        <div className="overflow-x-auto p-3 sm:p-6 print:overflow-visible print:p-0">
          <div className="print-report mx-auto min-w-[640px] max-w-[210mm] bg-white p-[10mm] text-black shadow-sm print:min-w-0 print:max-w-none print:p-0 print:shadow-none">
            <PrintHeader
              screen
              title={title}
              details={[
                t('members.listPrint.count', { count: data.length }),
                params.search && t('members.listPrint.search', { q: params.search }),
                params.status && labels.status(params.status),
                params.gender && labels.gender(params.gender),
                hasFilters && !params.search && !params.status && !params.gender && t('members.listPrint.filtered'),
              ]}
            />
            <table className="w-full border-collapse text-[10pt]">
              <thead>
                <tr className="bg-neutral-100 text-left">
                  <th className={`${cell} w-8 text-center`}>#</th>
                  <th className={cell}>{t('members.table.code')}</th>
                  <th className={cell}>{t('members.table.name')}</th>
                  <th className={cell}>{t('members.table.gender')}</th>
                  <th className={cell}>{t('members.table.classes')}</th>
                  <th className={cell}>{t('members.table.phone')}</th>
                  <th className={cell}>{t('members.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m, i) => (
                  <tr key={m.id}>
                    <td className={`${cell} tabular text-center`}>{i + 1}</td>
                    <td className={`${cell} font-mono whitespace-nowrap`}>{m.memberCode}</td>
                    <td className={cell}>
                      {memberFullName(m)}
                      {m.christianName && <span className="block text-[8pt] text-neutral-600">{m.christianName}</span>}
                    </td>
                    <td className={cell}>{labels.gender(m.gender)}</td>
                    <td className={cell}>
                      {m.classes.map((c) => `${name(c.classType)} · ${gradeLabel(c.classGrade)}`).join('، ')}
                    </td>
                    <td className={`${cell} tabular whitespace-nowrap`}>{formatPhone(m.phone)}</td>
                    <td className={cell}>{labels.status(m.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
