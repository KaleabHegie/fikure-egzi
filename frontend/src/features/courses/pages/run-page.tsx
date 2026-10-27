import { ClipboardList, ListChecks, Pencil, Trash2 } from 'lucide-react'
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
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { coursesApi, useCourseMutation, useGradebook } from '../api'
import { AssessmentsDialog } from '../components/assessments-dialog'
import { PhaseBadge } from '../components/course-badges'
import { MarksSheet } from '../components/marks-sheet'
import { RunDialog } from '../components/run-dialog'

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

/** One run of a course: its teachers, assessments and the mark sheet. */
export function RunPage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const navigate = useNavigate()
  const id = Number(useParams().runId)
  const { user, can } = useAuth()
  const book = useGradebook(id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const updateRun = useCourseMutation((input: Parameters<typeof coursesApi.updateRun>[1]) => coursesApi.updateRun(id, input))
  const removeRun = useCourseMutation(() => coursesApi.removeRun(id))
  const setAssessments = useCourseMutation((list: Parameters<typeof coursesApi.setAssessments>[1]) =>
    coursesApi.setAssessments(id, list),
  )
  const setMarks = useCourseMutation((scores: Parameters<typeof coursesApi.setMarks>[1]) => coursesApi.setMarks(id, scores))

  if (book.isError) return <ErrorState error={book.error} onRetry={() => void book.refetch()} />
  if (book.isPending) return <Skeleton className="h-96 rounded-xl" />
  const run = book.data.offering
  const canManage = Boolean(run.canManage)
  const canMark =
    canManage ||
    (run.phase !== 'finished' && can(PERMISSIONS.COURSES_TEACH) && run.teachers.some((x) => x.id === user?.id))
  const students = book.data.students
  const results = students.filter((s) => s.result)
  const passed = results.filter((s) => s.result === 'PASS').length

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          can(PERMISSIONS.COURSES_MANAGE)
            ? { to: `/courses/${run.courseId}`, label: name(run.course) }
            : { to: '/courses', label: t('courses.mine') }
        }
        title={name(run.course)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {name(run.classGrade.classType)} · {name(run.classGrade)}
            </span>
            <PhaseBadge phase={run.phase} />
          </span>
        }
        actions={
          <>
            {canMark && (
              <Button variant="outline" onClick={() => setAssessing(true)}>
                <ListChecks />
                {t('courses.assessments.title')}
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil />
                  {t('courses.runs.edit')}
                </Button>
                <Button variant="outline" size="icon" onClick={() => setDeleting(true)} aria-label={t('courses.runs.delete')}>
                  <Trash2 />
                </Button>
              </>
            )}
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-5 lg:grid-cols-4">
        <Stat label={t('courses.runs.period')}>
          {formatDate(run.startDate)} – {formatDate(run.endDate)}
        </Stat>
        <Stat label={t('courses.runs.teachers')}>
          {run.teachers.map((x) => (x.member ? memberFullName(x.member) : x.fullName)).join('، ')}
        </Stat>
        <Stat label={t('courses.runs.students')}>
          <span className="tabular">{students.length}</span>
        </Stat>
        <Stat label={t('courses.runs.results')}>
          {results.length === 0 ? (
            '—'
          ) : (
            <span className="tabular">{t('courses.runs.passedOf', { passed, total: results.length })}</span>
          )}
        </Stat>
      </dl>

      {run.assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('courses.assessments.noneTitle')}
          description={canMark ? t('courses.assessments.noneBody') : t('courses.assessments.noneBodyReadOnly')}
          action={
            canMark && (
              <Button onClick={() => setAssessing(true)}>
                <ListChecks />
                {t('courses.assessments.setUp')}
              </Button>
            )
          }
          className="rounded-xl border bg-card"
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('courses.marks.noStudents')}
          description={t('courses.marks.noStudentsBody')}
          className="rounded-xl border bg-card"
        />
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{t('courses.marks.title')}</h2>
            {run.totalMax !== 100 && (
              <p className="text-sm text-[oklch(0.45_0.1_70)] dark:text-warning">
                {t('courses.marks.incomplete', { total: run.totalMax })}
              </p>
            )}
          </div>
          <MarksSheet
            key={run.assessments.map((a) => a.id).join(',')}
            book={book.data}
            editable={canMark}
            onSave={async (scores) => {
              await setMarks.mutateAsync(scores)
            }}
          />
        </section>
      )}

      <AssessmentsDialog
        open={assessing}
        onOpenChange={setAssessing}
        assessments={run.assessments}
        onSave={async (list) => {
          await setAssessments.mutateAsync(list)
          toast.success(t('courses.assessments.saved'))
        }}
      />
      {canManage && (
        <RunDialog
          open={editing}
          onOpenChange={setEditing}
          course={{ ...run.course }}
          run={run}
          onSave={async (input) => {
            await updateRun.mutateAsync(input)
            toast.success(t('courses.runs.updated'))
          }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('courses.runs.deleteTitle')}
        description={t('courses.runs.deleteBody')}
        confirmLabel={t('courses.runs.delete')}
        destructive
        pending={removeRun.isPending}
        onConfirm={() =>
          removeRun.mutate(undefined, {
            onSuccess: () => {
              toast.success(t('courses.runs.deleted'))
              navigate(`/courses/${run.courseId}`, { replace: true })
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </div>
  )
}
