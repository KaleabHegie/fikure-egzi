import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  ChevronRight,
  Crown,
  Landmark,
  type LucideIcon,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
import type { CountByKey, MemberStats } from '@/features/members/types'
import { memberFullName } from '@/features/members/utils'
import { ecMonthName, ecToday, formatEth } from '@/lib/ethiopian-calendar'
import { formatDate } from '@/lib/format'
import { NAVIGATION } from '@/components/layout/navigation'
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { bucketByEcMonth } from '../components/ec-buckets'
import { JoinedChart } from '../components/joined-chart'

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const countOf = <K extends string>(rows: CountByKey<K>[], key: K) => rows.find((r) => r.key === key)?.count ?? 0

/** Counts up to the target on mount; jumps straight there under reduced motion. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min((now - start) / duration, 1)
      setValue(Math.round(target * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

/** Section card in the register style: chip-marked title over a dashed rule, like the ledger rows. */
function Card({
  title,
  icon: Icon,
  action,
  className,
  delay,
  children,
}: {
  title: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
  /** Entrance stagger in ms. */
  delay?: number
  children: React.ReactNode
}) {
  return (
    <section
      className={cn('rise-in card-lift rounded-xl border bg-card p-5', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <header className="mb-4 flex items-center justify-between gap-2 border-b border-dashed pb-3">
        <h2 className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
          {Icon && (
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-brand" aria-hidden>
              <Icon className="size-3.5" />
            </span>
          )}
          <span className="truncate">{title}</span>
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

/**
 * Headline number with one line of context. The figure is set in the Ge'ez
 * serif like a register entry; the share meter is a thread that ends in a
 * gilt tibeb diamond.
 */
function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  meter,
  delay,
}: {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  /** 0–100: optional thin progress meter under the number. */
  meter?: number
  /** Entrance stagger in ms. */
  delay?: number
}) {
  const shown = useCountUp(value)
  return (
    <div
      className="rise-in card-lift flex flex-col rounded-xl border bg-card p-5"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
          <p className="tabular mt-2.5 font-record text-[2.6rem] leading-none font-semibold">{shown.toLocaleString()}</p>
        </div>
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-brand ring-1 ring-gold/60 ring-offset-2 ring-offset-card"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-auto pt-3">
        {meter !== undefined && (
          <div className="relative mr-1.5 mb-2 h-1 rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${meter}%` }} />
            <span
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-gold ring-2 ring-card"
              style={{ left: `${Math.max(meter, 1)}%` }}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

const DONUT_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

/**
 * Donut of shares with the total set in the Ge'ez serif at its centre.
 * The legend carries every label and count as text, so identity is never
 * color alone; hovering a legend row lights up its slice.
 */
function Donut<K extends string>({ rows, label, total }: { rows: CountByKey<K>[]; label: (k: K) => string; total: number }) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState<K | null>(null)
  const sorted = [...rows].filter((r) => r.count > 0).sort((a, b) => b.count - a.count)
  const sum = sorted.reduce((n, r) => n + r.count, 0)
  if (sorted.length === 0 || sum === 0) return <p className="text-sm text-muted-foreground">{t('dashboard.noData')}</p>

  const r = 48
  const c = 2 * Math.PI * r
  const gap = sorted.length > 1 ? 3 : 0
  const arcs = sorted.map((row) => (row.count / sum) * c)
  const segments = sorted.map((row, i) => ({
    row,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    len: Math.max((arcs[i] ?? 0) - gap, 0.5),
    start: arcs.slice(0, i).reduce((n, len) => n + len, 0),
  }))

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" aria-hidden>
        <svg viewBox="0 0 120 120" className="size-32 -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="13" />
          {segments.map(({ row, color, len, start }) => (
            <circle
              key={row.key}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={hovered === row.key ? 16 : 13}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-(start + gap / 2)}
              className="transition-all duration-200"
              opacity={hovered !== null && hovered !== row.key ? 0.3 : 1}
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="tabular font-record text-2xl leading-none font-semibold">
              {(hovered !== null ? (sorted.find((row) => row.key === hovered)?.count ?? sum) : sum).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {hovered !== null ? label(hovered) : t('dashboard.total')}
            </p>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {segments.map(({ row, color }) => (
          <li key={row.key}>
            <div
              className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="size-2 shrink-0 rotate-45 rounded-[1px]" style={{ background: color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{label(row.key)}</span>
              <span className="tabular shrink-0 text-sm font-medium">{row.count.toLocaleString()}</span>
              <span className="tabular w-10 shrink-0 text-right text-xs text-muted-foreground">
                {pct(row.count, total)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
          className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-lg bg-brand px-3 py-2.5 text-brand-foreground hover:opacity-95"
        >
          {/* Faint cross motif, same as the other brand surfaces. */}
          <span className="pattern-cross absolute inset-0 opacity-[0.08]" aria-hidden />
          <Landmark className="relative size-4 text-gold" />
          <span className="relative flex-1 font-medium">{name(office)}</span>
          <span className="relative text-xs text-brand-foreground/75">
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

/** Like pct, but only all or none show as 100% or 0% (2,009 of 2,015 reads 99%, not 100%). */
const share = (part: number, whole: number) =>
  part === 0 || part === whole ? pct(part, whole) : Math.min(Math.max(pct(part, whole), 1), 99)

/** How complete members' records are; the photo counts open the members list filtered by photo. */
function CompletionOverview({ total, completion }: { total: number; completion: MemberStats['completion'] }) {
  const { t } = useTranslation()
  const shown = useCountUp(completion.average)
  const rows: { label: string; count: number; to?: string; tone: string }[] = [
    { label: t('dashboard.completionComplete'), count: completion.complete, tone: 'bg-primary' },
    { label: t('dashboard.completionUnderHalf'), count: completion.underHalf, tone: 'bg-destructive' },
    { label: t('dashboard.completionWithPhoto'), count: completion.withPhoto, to: '/members?hasPhoto=true', tone: 'bg-chart-1' },
    {
      label: t('dashboard.completionWithoutPhoto'),
      count: total - completion.withPhoto,
      to: '/members?hasPhoto=false',
      tone: 'bg-gold',
    },
  ]
  return (
    <Card title={t('dashboard.completionTitle')} icon={ClipboardList}>
      <div className="flex items-baseline gap-2">
        <p className="tabular font-record text-[2.6rem] leading-none font-semibold">{shown}%</p>
        <p className="text-xs text-muted-foreground">{t('dashboard.completionAverage')}</p>
      </div>
      <div className="relative mt-3 mr-1.5 h-1 rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-chart-1" style={{ width: `${completion.average}%` }} />
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-gold ring-2 ring-card"
          style={{ left: `${Math.max(completion.average, 1)}%` }}
        />
      </div>
      <ul className="mt-4 divide-y">
        {rows.map((row) => {
          const content = (
            <>
              <span className={cn('size-2 shrink-0 rotate-45 rounded-[1px]', row.tone)} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
              <span className="tabular text-sm font-medium">{row.count.toLocaleString()}</span>
              <span className="tabular w-10 text-right text-xs text-muted-foreground">{share(row.count, total)}%</span>
              {row.to && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
            </>
          )
          return (
            <li key={row.label}>
              {row.to ? (
                <Link to={row.to} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60">
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 py-2 pr-[1.375rem]">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
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
          delay={60}
          meter={pct(active, data.total)}
          hint={t('dashboard.share', { pct: pct(active, data.total) })}
        />
        {can(PERMISSIONS.DEPARTMENTS_READ) && (
          <KpiTile
            label={t('dashboard.serving')}
            value={data.servingInDepartments}
            icon={Building2}
            delay={120}
            meter={pct(data.servingInDepartments, data.total)}
            hint={t('dashboard.share', { pct: pct(data.servingInDepartments, data.total) })}
          />
        )}
        {can(PERMISSIONS.CLASSES_READ) && (
          <KpiTile
            label={t('dashboard.placed')}
            value={data.placedInClasses}
            icon={BookOpen}
            delay={180}
            meter={pct(data.placedInClasses, data.total)}
            hint={t('dashboard.notPlaced', { count: notPlaced })}
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('dashboard.joinedChart')} className="xl:col-span-2" delay={220}>
          <p className="-mt-2 mb-4 text-xs text-muted-foreground">{t('dashboard.joinedChartHint')}</p>
          <JoinedChart days={data.joinedByDay} />
        </Card>
        <Card title={t('dashboard.byGender')} delay={280}>
          <Donut rows={data.byGender} label={labels.gender} total={data.total} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {can(PERMISSIONS.DEPARTMENTS_READ) && <DepartmentsOverview />}
        {can(PERMISSIONS.CLASSES_READ) && <ClassesOverview />}
        <div className="space-y-4">
          <CompletionOverview total={data.total} completion={data.completion} />
          <RecentMembers />
          <Card title={t('dashboard.byStatus')}>
            <Donut rows={data.byStatus} label={labels.status} total={data.total} />
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
    const entries = NAVIGATION.flatMap((section) => section.items).flatMap(
      (item): { to?: string; permission?: PermissionCode }[] => (item.children ? [...item.children] : [item]),
    )
    const first = entries.find(
      (entry) => entry.to && entry.to !== '/' && (!entry.permission || can(entry.permission)),
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
