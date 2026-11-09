import { CalendarDays, ClipboardCheck, ListFilter, Plus, Search, TriangleAlert, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FilterChip } from '@/components/common/filter-chip'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useDepartments } from '@/features/departments/api'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { examsApi, useExamMutation, useExams } from '../api'
import { ExamDialog } from '../components/exam-dialog'
import type { Exam } from '../types'

const ALL = '__all__'

function ExamCard({ exam, index }: { exam: Exam; index: number }) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const title = i18n.language === 'en' && exam.nameEn ? exam.nameEn : exam.nameAm
  const other = i18n.language === 'en' ? (exam.nameEn ? exam.nameAm : null) : exam.nameEn
  const progress = exam.candidateCount > 0 ? Math.round((exam.markedCount / exam.candidateCount) * 100) : 0
  return (
    <article
      className="card-lift rise-in group relative flex flex-col gap-3 rounded-xl border bg-card p-4"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/20">
          <ClipboardCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/exams/${exam.id}`} className="font-record text-lg leading-snug font-semibold after:absolute after:inset-0 hover:underline">
            {title}
          </Link>
          {other && <p className="truncate text-xs text-muted-foreground">{other}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{name(exam.department)}</span>
            {exam.heldOn && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" aria-hidden />
                {formatDate(exam.heldOn)}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {exam.parts.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t('exams.noParts')}</span>
        ) : (
          exam.parts.map((p) => (
            <span key={p.id} className="tabular inline-flex h-6 items-center gap-1 rounded-full border bg-background px-2.5 text-xs">
              {p.name} <span className="font-semibold text-brand">{p.weight}%</span>
            </span>
          ))
        )}
        {exam.parts.length > 0 && exam.totalWeight !== 100 && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning/15 px-2.5 text-xs text-foreground">
            <TriangleAlert className="size-3" aria-hidden />
            {t('exams.weightsAddTo', { total: exam.totalWeight })}
          </span>
        )}
      </div>

      <div className="mt-auto grid gap-1.5 border-t border-dashed pt-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {t('exams.candidatesCount', { count: exam.candidateCount })}
          </span>
          <span className="tabular">
            {t('exams.markedOf', { marked: exam.markedCount, total: exam.candidateCount })}
            {exam.markedCount > 0 && ` · ${t('exams.passedCount', { count: exam.passedCount })}`}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </article>
  )
}

/** A department's own exams and assessments (not tied to a course). */
export function ExamsPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const navigate = useNavigate()
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [departmentId, setDepartmentId] = useState<number | undefined>()
  const [creating, setCreating] = useState(false)
  const { data: departments } = useDepartments()
  const { data, isPending, isError, error, refetch } = useExams({ search: query || undefined, departmentId })
  const create = useExamMutation(examsApi.create)

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const department = departments?.find((d) => d.id === departmentId)
  const hasFilters = Boolean(query || departmentId)

  let body: React.ReactNode
  if (isError) body = <ErrorState error={error} onRetry={() => void refetch()} className="rounded-xl border bg-card" />
  else if (isPending) {
    body = (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    )
  } else if (data.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardCheck}
        title={hasFilters ? t('exams.emptyFiltered') : t('exams.empty')}
        description={hasFilters ? t('exams.emptyFilteredBody') : t('exams.emptyBody')}
        className="rounded-xl border bg-card"
        action={
          !hasFilters &&
          can(PERMISSIONS.EXAMS_MANAGE) && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('exams.new')}
            </Button>
          )
        }
      />
    )
  } else {
    body = (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((exam, i) => (
          <ExamCard key={exam.id} exam={exam} index={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('exams.title')}
        description={t('exams.description')}
        actions={
          can(PERMISSIONS.EXAMS_MANAGE) && (
            <Button size="lg" onClick={() => setCreating(true)}>
              <Plus />
              {t('exams.new')}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('exams.searchPlaceholder')}
            aria-label={t('exams.searchPlaceholder')}
            className="pl-8"
          />
        </div>
        {department && (
          <FilterChip category={t('nav.departments')} value={name(department)} onClear={() => setDepartmentId(undefined)} />
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setDepartmentId(undefined)
            }}
          >
            <X />
            {t('common.clear')}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ListFilter />
              {t('common.filter')}
              {departmentId && (
                <span className="tabular grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  1
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('nav.departments')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                <DropdownMenuRadioGroup
                  value={departmentId ? String(departmentId) : ALL}
                  onValueChange={(v) => setDepartmentId(v === ALL ? undefined : Number(v))}
                >
                  <DropdownMenuRadioItem value={ALL}>{t('exams.allDepartments')}</DropdownMenuRadioItem>
                  {(departments ?? []).map((d) => (
                    <DropdownMenuRadioItem key={d.id} value={String(d.id)} className={cn(d.parentId !== null && 'pl-8')}>
                      {name(d)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {body}

      <ExamDialog
        open={creating}
        onOpenChange={setCreating}
        onSave={async (input, parts) => {
          const exam = await create.mutateAsync({ ...input, parts })
          toast.success(t('exams.created'))
          navigate(`/exams/${exam.id}`)
        }}
      />
    </div>
  )
}
