import { Clock, ListChecks, Lock, Pencil, Trash2, TriangleAlert, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PrintButton } from '@/components/common/print'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { useAuth } from '@/features/auth/use-auth'
import { oversees } from '@/lib/edit-window'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PERMISSIONS } from '@/lib/permissions'
import { examsApi, useExamMutation, useExamSheet } from '../api'
import { AddCandidatesDialog } from '../components/add-candidates-dialog'
import { ExamDialog } from '../components/exam-dialog'
import { ExamMarksSheet } from '../components/exam-marks-sheet'
import { ExamPrintSheet } from '../components/exam-print-sheet'
import { PartsDialog } from '../components/parts-dialog'
import { fullyMarked, matchesFilter, type ExamFilter } from '../exam-filter'
import type { ExamMember } from '../types'

/** A figure above the mark sheet; pressing it shows only those candidates (again: everyone). */
function Figure({
  label,
  value,
  hint,
  active,
  onClick,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border bg-card px-4 py-3 text-left transition-colors outline-none',
        'hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/40 active:bg-accent',
        active && 'border-primary bg-primary/8 ring-1 ring-primary',
        className,
      )}
    >
      <span className={cn('block text-xs', active ? 'font-medium text-primary' : 'text-muted-foreground')}>{label}</span>
      <span className="tabular mt-0.5 block font-record text-2xl font-semibold">{value}</span>
      <span className="block min-h-4 text-xs text-muted-foreground">{hint}</span>
    </button>
  )
}

/** One exam: its parts and weights, its candidates and the mark sheet. */
export function ExamPage() {
  const { t, i18n } = useTranslation()
  const { user, can } = useAuth()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const navigate = useNavigate()
  const id = Number(useParams().id)
  const sheet = useExamSheet(id)
  const [editing, setEditing] = useState(false)
  const [parting, setParting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removing, setRemoving] = useState<ExamMember | null>(null)
  const [filter, setFilter] = useState<ExamFilter>('all')
  /** Only one group marked together (picked on the mark sheet). */
  const [group, setGroup] = useState<number | null>(null)

  const update = useExamMutation((input: Parameters<typeof examsApi.update>[1]) => examsApi.update(id, input))
  const setParts = useExamMutation((parts: Parameters<typeof examsApi.setParts>[1]) => examsApi.setParts(id, parts))
  const addCandidates = useExamMutation((input: Parameters<typeof examsApi.addCandidates>[1]) => examsApi.addCandidates(id, input))
  const removeCandidate = useExamMutation((memberId: number) => examsApi.removeCandidate(id, memberId))
  const setMarks = useExamMutation((input: Parameters<typeof examsApi.setMarks>[1]) => examsApi.setMarks(id, input))
  const remove = useExamMutation(() => examsApi.remove(id))

  if (sheet.isError) return <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} />
  if (sheet.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }
  const { exam, candidates } = sheet.data
  const title = i18n.language === 'en' && exam.nameEn ? exam.nameEn : exam.nameAm
  const count = (f: ExamFilter) => candidates.filter((c) => matchesFilter(c, exam.parts, f)).length
  const marked = candidates.filter((c) => fullyMarked(c, exam.parts)).length
  const passed = count('passed')
  const failed = count('failed')
  const passRate = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null
  const pick = (f: ExamFilter) => {
    setGroup(null)
    setFilter((now) => (now === f ? 'all' : f))
  }
  // Exam takers change the department's exams until the 5th day after; heads and the ፅህፈት ቤት any time.
  const limited = can(PERMISSIONS.EXAMS_MANAGE) && !oversees(user, can, PERMISSIONS.EXAMS_OVERRIDE)
  const until = formatDate(exam.editableUntil)

  return (
    <>
      <div className="space-y-5 print:hidden">
        <PageHeader
          back={{ to: '/exams', label: t('exams.title') }}
          title={title}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-foreground/80">
                {name(exam.classType)} · {exam.classGrade ? gradeLabel(exam.classGrade) : t('exams.fields.allLevels')}
              </span>
              <span>· {name(exam.department)}</span>
              {exam.heldOn && <span>· {formatDate(exam.heldOn)}</span>}
              <span>· {t('exams.passMarkIs', { mark: exam.passMark })}</span>
            </span>
          }
          actions={
            <>
              <PrintButton disabled={candidates.length === 0} name={title} />
              {exam.canManage && (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil />
                    {t('common.edit')}
                  </Button>
                  <Button variant="outline" onClick={() => setParting(true)}>
                    <ListChecks />
                    {t('exams.parts.title')}
                  </Button>
                  <Button onClick={() => setAdding(true)}>
                    <UserPlus />
                    {t('exams.candidates.addTitle')}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleting(true)} aria-label={t('exams.delete.title')}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </>
          }
        />

        {limited && (
          <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {exam.canManage ? <Clock className="size-4 shrink-0" /> : <Lock className="size-4 shrink-0" />}
            {exam.canManage ? t('exams.lock.openUntil', { date: until }) : t('exams.lock.closed', { date: until })}
          </p>
        )}

        {exam.description && <p className="max-w-3xl text-sm whitespace-pre-line text-muted-foreground">{exam.description}</p>}

        <div className="flex flex-wrap items-center gap-1.5">
          {exam.parts.map((p) => (
            <span key={p.id} className="tabular inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-sm">
              {p.name} <span className="font-semibold text-brand">{p.weight}%</span>
            </span>
          ))}
          {exam.parts.length > 0 && exam.totalWeight !== 100 && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-warning/15 px-3 text-sm">
              <TriangleAlert className="size-3.5" aria-hidden />
              {t('exams.weightsIncomplete', { total: exam.totalWeight })}
            </span>
          )}
        </div>

        <div role="group" aria-label={t('exams.figures.filter')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Figure
            label={t('exams.figures.candidates')}
            value={candidates.length}
            hint={t('exams.figures.showAll')}
            active={filter === 'all' && group === null}
            onClick={() => {
              setGroup(null)
              setFilter('all')
            }}
            className="col-span-2 sm:col-span-1"
          />
          <Figure
            label={t('exams.figures.unmarked')}
            value={candidates.length - marked}
            hint={t('exams.figures.needMarks')}
            active={filter === 'unmarked'}
            onClick={() => pick('unmarked')}
          />
          <Figure
            label={t('exams.figures.marked')}
            value={marked}
            hint={t('exams.figures.ofCandidates', { count: candidates.length })}
            active={filter === 'marked'}
            onClick={() => pick('marked')}
          />
          <Figure
            label={t('exams.figures.passed')}
            value={passed}
            hint={passRate === null ? undefined : t('exams.figures.rate', { rate: passRate })}
            active={filter === 'passed'}
            onClick={() => pick('passed')}
          />
          <Figure
            label={t('exams.figures.failed')}
            value={failed}
            active={filter === 'failed'}
            onClick={() => pick('failed')}
          />
        </div>

        {exam.parts.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={t('exams.setPartsFirst')}
            description={t('exams.setPartsFirstBody')}
            className="rounded-xl border bg-card"
            action={
              exam.canManage && (
                <Button onClick={() => setParting(true)}>
                  <ListChecks />
                  {t('exams.parts.title')}
                </Button>
              )
            }
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('exams.noCandidates')}
            description={t('exams.noCandidatesBody')}
            className="rounded-xl border bg-card"
            action={
              exam.canManage && (
                <Button onClick={() => setAdding(true)}>
                  <UserPlus />
                  {t('exams.candidates.addTitle')}
                </Button>
              )
            }
          />
        ) : (
          <ExamMarksSheet
            sheet={sheet.data}
            filter={filter}
            group={group}
            onGroup={(g) => {
              setGroup(g)
              if (g !== null) setFilter('all')
            }}
            editable={exam.canManage}
            onSave={async (marks, groups) => {
              await setMarks.mutateAsync({ marks, groups })
            }}
            onRemove={setRemoving}
          />
        )}

        <ExamDialog
          open={editing}
          onOpenChange={setEditing}
          exam={exam}
          onSave={async (input) => {
            await update.mutateAsync(input)
            toast.success(t('exams.saved'))
          }}
        />
        <PartsDialog
          open={parting}
          onOpenChange={setParting}
          parts={exam.parts}
          onSave={async (parts) => {
            await setParts.mutateAsync(parts)
            toast.success(t('exams.saved'))
          }}
        />
        <AddCandidatesDialog
          open={adding}
          onOpenChange={setAdding}
          examId={id}
          classTypeId={exam.classTypeId}
          onAdd={async (input) => (await addCandidates.mutateAsync(input)).added}
        />
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => !open && setRemoving(null)}
          title={t('exams.candidates.removeTitle')}
          description={removing ? t('exams.candidates.removeBody', { name: memberFullName(removing) }) : ''}
          confirmLabel={t('exams.candidates.remove')}
          destructive
          pending={removeCandidate.isPending}
          onConfirm={() => {
            if (!removing) return
            removeCandidate.mutate(removing.id, {
              onSuccess: () => setRemoving(null),
              onError: (e) => toast.error(getErrorMessage(e)),
            })
          }}
        />
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={t('exams.delete.title')}
          description={t('exams.delete.body', { name: exam.nameAm, count: exam.candidateCount })}
          confirmLabel={t('exams.delete.confirm')}
          destructive
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                toast.success(t('exams.delete.done'))
                navigate('/exams', { replace: true })
              },
              onError: (e) => toast.error(getErrorMessage(e)),
            })
          }
        />
      </div>
      <ExamPrintSheet
        exam={exam}
        rows={candidates.filter((c) => matchesFilter(c, exam.parts, filter) && (group === null || c.groupId === group))}
        filter={filter}
        summary={[
          `${t('exams.figures.candidates')} ${candidates.length}`,
          `${t('exams.figures.marked')} ${marked}`,
          `${t('exams.figures.passed')} ${passed}`,
          `${t('exams.figures.failed')} ${failed}`,
          passRate !== null && t('exams.figures.rate', { rate: passRate }),
        ]
          .filter(Boolean)
          .join(' · ')}
      />
    </>
  )
}
