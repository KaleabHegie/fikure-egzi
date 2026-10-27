import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { formatDate } from '@/lib/format'
import { useDepartmentHistory } from '../api'
import { RoleBadge } from './role-badge'

/** Ended service periods in a department: people who left, and earlier roles of people still here. */
export function FormerMembers({ departmentId }: { departmentId: number }) {
  const { t } = useTranslation()
  const { data, isPending, isError } = useDepartmentHistory(departmentId)
  if (isError) return null

  return (
    <section className="mt-6 rounded-xl border bg-card">
      <header className="flex items-start gap-3 border-b px-5 py-3">
        <History className="mt-0.5 size-4 text-muted-foreground" />
        <div>
          <h2 className="font-medium">{t('departments.roster.formerTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('departments.roster.formerDescription')}</p>
        </div>
      </header>
      {isPending ? (
        <div className="p-5">
          <Skeleton className="h-16" />
        </div>
      ) : data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{t('departments.roster.noFormer')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">{t('departments.roster.member')}</TableHead>
              <TableHead>{t('departments.roster.role')}</TableHead>
              <TableHead className="pr-5">{t('departments.roster.served')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="pl-5">
                  <Link to={`/members/${h.member.id}`} className="flex items-center gap-3 hover:underline">
                    <MemberAvatar member={h.member} />
                    <span className="font-medium">{memberFullName(h.member)}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <RoleBadge role={h.role} />
                </TableCell>
                <TableCell className="tabular pr-5 whitespace-nowrap text-muted-foreground">
                  {t('members.history.period', { from: formatDate(h.startedAt), to: formatDate(h.endedAt) })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
