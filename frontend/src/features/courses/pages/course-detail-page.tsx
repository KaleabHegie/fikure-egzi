import { CalendarPlus, GraduationCap, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { getErrorMessage } from '@/lib/api/errors'
import { PERMISSIONS } from '@/lib/permissions'
import { coursesApi, useCourse, useCourseMutation, useRuns } from '../api'
import { CourseDialog } from '../components/course-dialog'
import { RunDialog } from '../components/run-dialog'
import { RunCard } from './courses-page'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

export function CourseDetailPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const navigate = useNavigate()
  const id = Number(useParams().id)
  const { can } = useAuth()
  const manager = can(PERMISSIONS.COURSES_MANAGE)
  const course = useCourse(id)
  const runs = useRuns({ courseId: id }, id > 0)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const update = useCourseMutation((input: Parameters<typeof coursesApi.update>[1]) => coursesApi.update(id, input))
  const remove = useCourseMutation(() => coursesApi.remove(id))
  const createRun = useCourseMutation(coursesApi.createRun)

  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} />
  if (course.isPending) return <Skeleton className="h-96 rounded-xl" />
  const c = course.data

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/courses', label: t('courses.title') }}
        title={name(c)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{c.courseCode}</span>
            <span>{name(c.department)}</span>
            {!c.isActive && <span>· {t('courses.inactiveLabel')}</span>}
          </span>
        }
        actions={
          manager && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                {t('courses.edit')}
              </Button>
              {c.offeringCount === 0 && (
                <Button variant="outline" onClick={() => setDeleting(true)}>
                  <Trash2 />
                  {t('courses.delete')}
                </Button>
              )}
            </>
          )
        }
      />

      <dl className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-4">
        <Detail label={t('courses.fields.duration')}>{t(`courses.durations.${c.duration}`)}</Detail>
        <Detail label={t('courses.fields.passMark')}>
          <span className="tabular">{c.passMark}</span> / 100
        </Detail>
        <Detail label={t('courses.fields.nameEn')}>{c.nameEn}</Detail>
        <Detail label={t('courses.runs.title')}>
          <span className="tabular">{c.offeringCount}</span>
        </Detail>
        {c.description && (
          <div className="sm:col-span-4">
            <Detail label={t('courses.fields.description')}>
              <span className="whitespace-pre-line">{c.description}</span>
            </Detail>
          </div>
        )}
      </dl>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('courses.runs.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('courses.runs.description')}</p>
          </div>
          {manager && c.isActive && (
            <Button onClick={() => setScheduling(true)}>
              <CalendarPlus />
              {t('courses.runs.new')}
            </Button>
          )}
        </div>
        {runs.isError ? (
          <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
        ) : runs.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : runs.data.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={t('courses.runs.noneYet')}
            description={t('courses.runs.noneYetBody')}
            className="rounded-xl border bg-card"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {runs.data.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>

      <CourseDialog
        open={editing}
        onOpenChange={setEditing}
        course={c}
        onSave={async (input) => {
          await update.mutateAsync(input)
          toast.success(t('courses.updated'))
        }}
      />
      <RunDialog
        open={scheduling}
        onOpenChange={setScheduling}
        course={c}
        onSave={async (input) => {
          const run = await createRun.mutateAsync(input)
          toast.success(t('courses.runs.created'))
          navigate(`/courses/runs/${run.id}`)
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('courses.deleteTitle')}
        description={t('courses.deleteBody', { name: name(c) })}
        confirmLabel={t('courses.delete')}
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success(t('courses.deleted'))
              navigate('/courses', { replace: true })
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </div>
  )
}
