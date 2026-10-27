import { BookOpen, Building2, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { RoleBadge } from '@/features/departments/components/role-badge'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMemberHistory } from '../api'
import type { ClassPeriod } from '../types'

/** Groups class periods per class type, keeping each type's newest-first order. */
function groupByType(periods: ClassPeriod[]) {
  const groups = new Map<number, { type: ClassPeriod['classType']; periods: ClassPeriod[] }>()
  for (const p of periods) {
    const group = groups.get(p.classType.id) ?? { type: p.classType, periods: [] }
    group.periods.push(p)
    groups.set(p.classType.id, group)
  }
  return [...groups.values()]
}

function Period({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const { t } = useTranslation()
  return (
    <span className="tabular text-xs text-muted-foreground">
      {endedAt
        ? t('members.history.period', { from: formatDate(startedAt), to: formatDate(endedAt) })
        : t('members.history.since', { date: formatDate(startedAt) })}
    </span>
  )
}

/** Vertical timeline item; the open (current) period gets a filled marker. */
function Item({ current, children }: { current: boolean; children: React.ReactNode }) {
  return (
    <li className="group relative pb-4 pl-6 last:pb-0">
      <span className="absolute top-0 bottom-0 left-[5px] w-px bg-border group-last:hidden" aria-hidden />
      <span
        className={cn(
          'absolute top-1 left-0 size-[11px] rounded-full border-2',
          current ? 'border-primary bg-primary' : 'border-muted-foreground/40 bg-card',
        )}
        aria-hidden
      />
      {children}
    </li>
  )
}

/** Class-grade and department history for one member (from the append-only history tables). */
export function MemberHistory({ memberId }: { memberId: number }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const { data, isPending, isError } = useMemberHistory(memberId)

  return (
    <section className="rounded-xl border bg-card p-5 lg:col-span-2">
      <div className="mb-4 flex items-start gap-3">
        <History className="mt-0.5 size-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-medium">{t('members.history.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('members.history.description')}</p>
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-32" />
      ) : isError ? null : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <BookOpen className="size-3.5" />
              {t('members.history.classes')}
            </h3>
            {data.classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('members.history.noClasses')}</p>
            ) : (
              <div className="space-y-4">
                {groupByType(data.classes).map(({ type, periods }) => (
                  <div key={type.id}>
                    <p className="mb-2 text-sm font-medium">{name(type)}</p>
                    <ol>
                      {periods.map((c) => (
                        <Item key={c.id} current={c.endedAt === null}>
                          <p className="text-sm">
                            <span className="font-medium">{gradeLabel(c.classGrade)}</span>
                            {c.endedAt === null && (
                              <span className="ml-2 rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
                                {t('members.history.current')}
                              </span>
                            )}
                          </p>
                          <Period startedAt={c.startedAt} endedAt={c.endedAt} />
                        </Item>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Building2 className="size-3.5" />
              {t('members.history.departments')}
            </h3>
            {data.departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('members.history.noDepartments')}</p>
            ) : (
              <ol>
                {data.departments.map((d) => (
                  <Item key={d.id} current={d.endedAt === null}>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Link to={`/departments/${d.department.id}`} className="font-medium hover:underline">
                        {name(d.department)}
                      </Link>
                      <RoleBadge role={d.role} />
                      {d.endedAt === null && (
                        <span className="rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
                          {t('members.history.current')}
                        </span>
                      )}
                    </p>
                    <Period startedAt={d.startedAt} endedAt={d.endedAt} />
                  </Item>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
