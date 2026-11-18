import { ClipboardCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { formatDate } from '@/lib/format'
import { useMemberExams } from '../api'
import type { MemberExam } from '../types'
import { ExamResultBadge } from './exam-result-badge'

/**
 * A member's department exams and their marks. On the staff member page it is hidden when
 * there are none; the member portal passes `load` (its own API), no links and an empty text.
 */
export function MemberExamsPanel({
  memberId,
  load,
  linkExams = true,
  emptyText,
}: {
  memberId: number
  load?: () => Promise<MemberExam[]>
  linkExams?: boolean
  emptyText?: string
}) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const { data, isPending, isError } = useMemberExams(memberId, load)

  if (isPending) return <Skeleton className="h-32 rounded-xl" />
  if (isError || !data || data.length === 0) {
    if (!emptyText || isError) return null
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="size-4 text-brand" aria-hidden />
          {t('exams.memberPanel')}
        </h2>
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby={`member-exams-${memberId}`}>
      <h2 id={`member-exams-${memberId}`} className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="size-4 text-brand" aria-hidden />
        {t('exams.memberPanel')}
      </h2>
      <ul className="divide-y divide-dashed">
        {data.map((exam) => (
          <li key={exam.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {linkExams ? (
                  <Link to={`/exams/${exam.id}`} className="font-medium hover:text-brand hover:underline">
                    {i18n.language === 'en' && exam.nameEn ? exam.nameEn : exam.nameAm}
                  </Link>
                ) : (
                  <p className="font-medium">{i18n.language === 'en' && exam.nameEn ? exam.nameEn : exam.nameAm}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {name(exam.classType)}
                  {exam.classGrade && ` · ${gradeLabel(exam.classGrade)}`}
                  {exam.heldOn && ` · ${formatDate(exam.heldOn)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular font-record text-lg font-semibold">{exam.total ?? '—'}</span>
                <ExamResultBadge result={exam.result} />
              </div>
            </div>
            <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {exam.parts.map((p) => (
                <span key={p.id}>
                  {p.name}: <span className="font-medium text-foreground">{p.score ?? '—'}</span>/{p.weight}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
