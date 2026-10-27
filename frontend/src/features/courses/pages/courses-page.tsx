import { BookMarked, CalendarRange, GraduationCap, Plus, Search, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PaginationBar } from '@/components/common/pagination-bar'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { coursesApi, useCourseMutation, useCourses, useRuns } from '../api'
import { PhaseBadge } from '../components/course-badges'
import { CourseDialog } from '../components/course-dialog'
import type { CourseListParams, CourseRun, RunPhase } from '../types'

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** A run as a card: what the teacher opens to enter marks. */
export function RunCard({ run }: { run: CourseRun }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  return (
    <Link
      to={`/courses/runs/${run.id}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors duration-150 ease-out outline-none hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{name(run.course)}</p>
          <p className="text-sm text-muted-foreground">
            {name(run.classGrade.classType)} · {name(run.classGrade)}
          </p>
        </div>
        <PhaseBadge phase={run.phase} />
      </div>
      <dl className="grid gap-1.5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarRange className="size-4 shrink-0" aria-hidden />
          <dt className="sr-only">{t('courses.runs.period')}</dt>
          <dd>
            {formatDate(run.startDate)} – {formatDate(run.endDate)}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <UsersRound className="size-4 shrink-0" aria-hidden />
          <dt className="sr-only">{t('courses.runs.teachers')}</dt>
          <dd className="truncate">{run.teachers.map((x) => (x.member ? memberFullName(x.member) : x.fullName)).join('، ')}</dd>
        </div>
      </dl>
      <p className={cn('text-xs', run.assessments.length === 0 ? 'text-[oklch(0.45_0.1_70)] dark:text-warning' : 'text-muted-foreground')}>
        {run.assessments.length === 0
          ? t('courses.runs.noAssessments')
          : t('courses.runs.assessmentSummary', { count: run.assessments.length, total: run.totalMax })}
      </p>
    </Link>
  )
}

function RunsGrid({ mine }: { mine: boolean }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<RunPhase | 'all'>('ongoing')
  const runs = useRuns({ mine: mine || undefined, phase: phase === 'all' ? undefined : phase })
  return (
    <div className="space-y-4">
      <Tabs value={phase} onValueChange={(v) => setPhase(v as RunPhase | 'all')}>
        <TabsList>
          {(['ongoing', 'upcoming', 'finished', 'all'] as const).map((p) => (
            <TabsTrigger key={p} value={p}>
              {p === 'all' ? t('courses.phases.all') : t(`courses.phases.${p}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : runs.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : runs.data.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={mine ? t('courses.runs.mineEmpty') : t('courses.runs.empty')}
          description={mine ? t('courses.runs.mineEmptyBody') : t('courses.runs.emptyBody')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {runs.data.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  )
}

function CourseList() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 })
  const query = useDebounced(search.trim())
  const courses = useCourses({ ...params, search: query || undefined })

  return (
    <div className="space-y-4">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setParams((p) => ({ ...p, page: 1 }))
          }}
          placeholder={t('courses.search')}
          aria-label={t('courses.search')}
          className="pl-8"
        />
      </div>
      {courses.isError ? (
        <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
      ) : courses.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : courses.data.data.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title={query ? t('courses.noMatch') : t('courses.empty')}
          description={t('courses.emptyBody')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t('courses.fields.name')}</TableHead>
                  <TableHead>{t('courses.fields.duration')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('courses.fields.department')}</TableHead>
                  <TableHead className="text-right">{t('courses.fields.passMark')}</TableHead>
                  <TableHead className="pr-4 text-right">{t('courses.runs.title')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.data.data.map((c) => (
                  <TableRow
                    key={c.id}
                    className={cn('cursor-pointer', !c.isActive && 'text-muted-foreground')}
                    onClick={() => navigate(`/courses/${c.id}`)}
                  >
                    <TableCell className="pl-4">
                      <Link to={`/courses/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {name(c)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{c.courseCode}</span>
                        {!c.isActive && ` · ${t('courses.inactiveLabel')}`}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{t(`courses.durations.${c.duration}`)}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{name(c.department)}</TableCell>
                    <TableCell className="tabular text-right">{c.passMark}</TableCell>
                    <TableCell className="tabular pr-4 text-right">{c.offeringCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4">
            <PaginationBar
              meta={courses.data.meta}
              onPageChange={(page) => setParams((p) => ({ ...p, page }))}
              onPageSizeChange={(pageSize) => setParams((p) => ({ ...p, page: 1, pageSize }))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Course managers (ትምህርት) see the catalogue and every run; teachers see the
 * runs they teach, which is where they enter marks.
 */
export function CoursesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { can } = useAuth()
  const manager = can(PERMISSIONS.COURSES_MANAGE)
  const [view, setView] = useState<'courses' | 'runs'>('courses')
  const [creating, setCreating] = useState(false)
  const create = useCourseMutation(coursesApi.create)

  if (!manager) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('courses.mine')} description={t('courses.mineDescription')} />
        <RunsGrid mine />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('courses.title')}
        description={t('courses.description')}
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus />
            {t('courses.new')}
          </Button>
        }
      />
      <Tabs value={view} onValueChange={(v) => setView(v as 'courses' | 'runs')}>
        <TabsList>
          <TabsTrigger value="courses">{t('courses.tabs.courses')}</TabsTrigger>
          <TabsTrigger value="runs">{t('courses.tabs.runs')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'courses' ? <CourseList /> : <RunsGrid mine={false} />}
      <CourseDialog
        open={creating}
        onOpenChange={setCreating}
        onSave={async (input) => {
          const course = await create.mutateAsync(input)
          toast.success(t('courses.created', { code: course.courseCode }))
          navigate(`/courses/${course.id}`)
        }}
      />
    </div>
  )
}
