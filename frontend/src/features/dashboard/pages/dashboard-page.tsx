import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronRight,
  Crown,
  Landmark,
  type LucideIcon,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/use-auth'
import { useClassTypes } from '@/features/classes/api'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { buildDepartmentTree } from '@/features/departments/types'
import { useMembers, useMemberStats } from '@/features/members/api'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { useMemberLabels } from '@/features/members/labels'
import type { CountByKey } from '@/features/members/types'
import { memberFullName } from '@/features/members/utils'
import { ecMonthName, ecToday, formatEth } from '@/lib/ethiopian-calendar'
import { formatDate } from '@/lib/format'
import { NAVIGATION } from '@/components/layout/navigation'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { bucketByEcMonth } from '../components/ec-buckets'
import { JoinedChart } from '../components/joined-chart'

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const countOf = <K extends string>(rows: CountByKey<K>[], key: K) => rows.find((r) => r.key === key)?.count ?? 0

function Card({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-5', className)}>
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function ViewAll({ to }: { to: string }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      {t('dashboard.viewAll')}
      <ChevronRight className="size-3.5" />
    </Link>
  )
}

/** Headline number with one line of context. */
function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  meter,
}: {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  /** 0–100: optional thin progress meter under the number. */
  meter?: number
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p>
      {meter !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${meter}%` }} />
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/** Horizontal single-hue bars; label + count are text, so identity is never color alone. */
function Bars<K extends string>({ rows, label, total }: { rows: CountByKey<K>[]; label: (k: K) => string; total: number }) {
  const { t } = useTranslation()
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">{t('dashboard.noData')}</p>
  return (
    <ul className="space-y-3">
      {sorted.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{label(r.key)}</span>
            <span className="tabular text-muted-foreground">
              {r.count.toLocaleString()} · {pct(r.count, total)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct(r.count, total)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function DepartmentsOverview() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { data } = useDepartments()
  if (!data) return <Skeleton className="h-80 rounded-xl" />
  const [office] = buildDepartmentTree(data)
  const departments = office?.children ?? []
  const max = Math.max(1, ...departments.map((d) => d.memberCount))
  return (
    <Card title={t('dashboard.departmentsTitle')} icon={Building2} action={<ViewAll to="/departments" />}>
      {office && (
        <Link
          to={`/departments/${office.id}`}
          className="mb-4 flex items-center gap-3 rounded-lg bg-brand px-3 py-2.5 text-brand-foreground hover:opacity-95"
        >
          <Landmark className="size-4 text-gold" />
          <span className="flex-1 font-medium">{name(office)}</span>
          <span className="text-xs text-brand-foreground/75">
            {t('departments.administers', { count: departments.length })}
          </span>
        </Link>
      )}
      <ul className="space-y-2.5">
        {departments.map((d) => (
          <li key={d.id}>
            <Link to={`/departments/${d.id}`} className="group block">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium group-hover:underline">{name(d)}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{d.memberCount}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${(d.memberCount / max) * 100}%` }} />
                </div>
                <span className="flex w-40 shrink-0 items-center gap-1 truncate text-xs text-muted-foreground">
                  <Crown className="size-3 shrink-0" />
                  <span className="truncate">{d.head ? memberFullName(d.head) : t('dashboard.noHead')}</span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** One mini column chart per class type (grade order is meaningful, so columns keep it). */
function ClassesOverview() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const { data } = useClassTypes()
  if (!data) return <Skeleton className="h-80 rounded-xl" />
  return (
    <Card title={t('dashboard.classesTitle')} icon={BookOpen} action={<ViewAll to="/classes" />}>
      <div className="space-y-6">
        {data.map((type) => {
          const max = Math.max(1, ...type.grades.map((g) => g.memberCount))
          return (
            <div key={type.id}>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-medium">{name(type)}</span>
                <span className="tabular text-xs text-muted-foreground">
                  {t('classes.members', { count: type.memberCount })}
                </span>
              </div>
              <div className="flex h-24 items-end gap-[2px]">
                {type.grades.map((g) => (
                  <Link
                    key={g.id}
                    to={`/members?classGradeId=${g.id}`}
                    title={`${gradeLabel(g)}: ${g.memberCount}`}
                    aria-label={`${gradeLabel(g)}: ${g.memberCount}`}
                    className="group flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <span className="tabular mb-0.5 text-[10px] text-muted-foreground group-hover:text-foreground">
                      {g.memberCount}
                    </span>
                    <span
                      className="w-full max-w-10 rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                      style={{ height: `${Math.max((g.memberCount / max) * 70, g.memberCount ? 3 : 0)}%` }}
                    />
                  </Link>
                ))}
              </div>
              <div className="mt-1 flex gap-[2px] border-t pt-1">
                {type.grades.map((g) => (
                  <span key={g.id} className="flex-1 truncate text-center text-[11px] font-medium text-muted-foreground">
                    {g.shortLabel ?? name(g)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function RecentMembers() {
  const { t } = useTranslation()
  const { data } = useMembers({ page: 1, pageSize: 6, sortBy: 'createdAt', sortOrder: 'desc' })
  return (
    <Card title={t('dashboard.recentTitle')} icon={UserPlus} action={<ViewAll to="/members" />}>
      {!data ? (
        <Skeleton className="h-48" />
      ) : (
        <ul className="divide-y">
          {data.data.map((m) => (
            <li key={m.id}>
              <Link to={`/members/${m.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40">
                <MemberAvatar member={m} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{memberFullName(m)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.memberCode} · {formatDate(m.joinedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Overview() {
  const { t, i18n } = useTranslation()
  const labels = useMemberLabels()
  const { can } = useAuth()
  const { data, isPending, isError, error, refetch } = useMemberStats()

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} className="rounded-xl border bg-card" />
  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const lang = i18n.language === 'am' ? 'am' : 'en'
  const thisMonth = bucketByEcMonth(data.joinedByDay).at(-1)?.count ?? 0
  const active = countOf(data.byStatus, 'ACTIVE')
  const notPlaced = data.total - data.placedInClasses

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={t('dashboard.registered')}
          value={data.total}
          icon={Users}
          hint={t('dashboard.joinedThisMonth', {
            count: thisMonth,
            month: ecMonthName(Math.min(ecToday().month, 12), lang),
          })}
        />
        <KpiTile
          label={t('dashboard.active')}
          value={active}
          icon={UserCheck}
          meter={pct(active, data.total)}
          hint={t('dashboard.share', { pct: pct(active, data.total) })}
        />
        {can(PERMISSIONS.DEPARTMENTS_READ) && (
          <KpiTile
            label={t('dashboard.serving')}
            value={data.servingInDepartments}
            icon={Building2}
            meter={pct(data.servingInDepartments, data.total)}
            hint={t('dashboard.share', { pct: pct(data.servingInDepartments, data.total) })}
          />
        )}
        {can(PERMISSIONS.CLASSES_READ) && (
          <KpiTile
            label={t('dashboard.placed')}
            value={data.placedInClasses}
            icon={BookOpen}
            meter={pct(data.placedInClasses, data.total)}
            hint={t('dashboard.notPlaced', { count: notPlaced })}
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('dashboard.joinedChart')} className="xl:col-span-2">
          <p className="-mt-3 mb-4 text-xs text-muted-foreground">{t('dashboard.joinedChartHint')}</p>
          <JoinedChart days={data.joinedByDay} />
        </Card>
        <Card title={t('dashboard.byGender')}>
          <Bars rows={data.byGender} label={labels.gender} total={data.total} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {can(PERMISSIONS.DEPARTMENTS_READ) && <DepartmentsOverview />}
        {can(PERMISSIONS.CLASSES_READ) && <ClassesOverview />}
        <div className="space-y-4">
          <RecentMembers />
          <Card title={t('dashboard.byStatus')}>
            <Bars rows={data.byStatus} label={labels.status} total={data.total} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { user, can } = useAuth()
  const firstName = user?.fullName.split(' ')[0]
  const [now] = useState(() => new Date())
  const today = formatEth(now, 'date', i18n.language === 'am' ? 'am' : 'en')

  // Attendance takers have no dashboard; send them to their first page (attendance).
  if (!can(PERMISSIONS.MEMBERS_READ)) {
    const first = NAVIGATION.flatMap((section) => section.items).find(
      (item) => item.to && item.to !== '/' && (!item.permission || can(item.permission)),
    )
    if (first?.to) return <Navigate to={first.to} replace />
  }

  return (
    <>
      <PageHeader
        title={firstName ? t('dashboard.welcome', { name: firstName }) : t('dashboard.welcomeAnonymous')}
        description={t('dashboard.today', { date: today })}
        actions={
          <>
            {can(PERMISSIONS.MEMBERS_READ) && (
              <Button asChild variant="outline" size="lg">
                <Link to="/members">
                  {t('dashboard.viewMembers')}
                  <ArrowRight />
                </Link>
              </Button>
            )}
            <Can permission={PERMISSIONS.MEMBERS_CREATE}>
              <Button asChild size="lg">
                <Link to="/members/new">
                  <UserPlus />
                  {t('members.register')}
                </Link>
              </Button>
            </Can>
          </>
        }
      />
      {can(PERMISSIONS.MEMBERS_READ) ? (
        <Overview />
      ) : (
        <p className="text-sm text-muted-foreground">{t('dashboard.noModules')}</p>
      )}
    </>
  )
}
