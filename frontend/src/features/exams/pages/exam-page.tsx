import { ListChecks, Pencil, Trash2, TriangleAlert, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { examsApi, useExamMutation, useExamSheet } from '../api'
import { AddCandidatesDialog } from '../components/add-candidates-dialog'
import { ExamDialog } from '../components/exam-dialog'
import { ExamMarksSheet } from '../components/exam-marks-sheet'
import { PartsDialog } from '../components/parts-dialog'
import type { ExamMember } from '../types'

function Figure({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 font-record text-2xl font-semibold">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/** One exam: its parts and weights, its candidates and the mark sheet. */
export function ExamPage() {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const navigate = useNavigate()
  const id = Number(useParams().id)
  const sheet = useExamSheet(id)
  const [editing, setEditing] = useState(false)
  const [parting, setParting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removing, setRemoving] = useState<ExamMember | null>(null)

  const update = useExamMutation((input: Parameters<typeof examsApi.update>[1]) => examsApi.update(id, input))
  const setParts = useExamMutation((parts: Parameters<typeof examsApi.setParts>[1]) => examsApi.setParts(id, parts))
  const addCandidates = useExamMutation((input: Parameters<typeof examsApi.addCandidates>[1]) => examsApi.addCandidates(id, input))
  const removeCandidate = useExamMutation((memberId: number) => examsApi.removeCandidate(id, memberId))
  const setMarks = useExamMutation((marks: Parameters<typeof examsApi.setMarks>[1]) => examsApi.setMarks(id, marks))
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
  const passRate = exam.markedCount > 0 ? Math.round((exam.passedCount / exam.markedCount) * 100) : null

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ to: '/exams', label: t('exams.title') }}
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-foreground/80">{name(exam.department)}</span>
            {exam.heldOn && <span>· {formatDate(exam.heldOn)}</span>}
            <span>· {t('exams.passMarkIs', { mark: exam.passMark })}</span>
          </span>
        }
        actions={
          exam.canManage && (
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
          )
        }
      />

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

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={t('exams.figures.candidates')} value={exam.candidateCount} />
        <Figure label={t('exams.figures.marked')} value={exam.markedCount} hint={t('exams.figures.ofCandidates', { count: exam.candidateCount })} />
        <Figure label={t('exams.figures.passed')} value={exam.passedCount} />
        <Figure label={t('exams.figures.passRate')} value={passRate === null ? '—' : `${passRate}%`} />
      </dl>

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
          editable={exam.canManage}
          onSave={async (marks) => {
            await setMarks.mutateAsync(marks)
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
  )
}
