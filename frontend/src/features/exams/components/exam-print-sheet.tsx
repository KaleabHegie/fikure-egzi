import { useTranslation } from 'react-i18next'
import { PrintHeader } from '@/components/common/print'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { formatDate } from '@/lib/format'
import type { ExamFilter } from '../exam-filter'
import type { Exam, ExamCandidateRow } from '../types'

/**
 * The exam's results on paper: one row per candidate shown on screen (the chosen
 * figure narrows it, e.g. only those who passed), with each part, the total and the result.
 */
export function ExamPrintSheet({
  exam,
  rows,
  filter,
  summary,
}: {
  exam: Exam
  rows: ExamCandidateRow[]
  filter: ExamFilter
  summary: string
}) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const title = i18n.language === 'en' && exam.nameEn ? exam.nameEn : exam.nameAm
  const cell = 'border border-neutral-400 px-2 py-1'

  return (
    <div className="print-report hidden text-black print:block">
      <PrintHeader
        title={title}
        details={[
          `${name(exam.classType)} · ${exam.classGrade ? gradeLabel(exam.classGrade) : t('exams.fields.allLevels')}`,
          name(exam.department),
          exam.heldOn && formatDate(exam.heldOn),
          t('exams.passMarkIs', { mark: exam.passMark }),
          summary,
          filter !== 'all' && t('print.showing', { filter: t(`exams.figures.${filter}`) }),
        ]}
      />
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className={`${cell} w-8 text-center`}>#</th>
            <th className={cell}>{t('exams.marks.candidate')}</th>
            {exam.parts.map((p) => (
              <th key={p.id} className={`${cell} text-center`}>
                {p.name}
                <span className="block text-[8pt] font-normal">/ {p.weight}</span>
              </th>
            ))}
            <th className={`${cell} text-center`}>
              {t('exams.marks.total')}
              <span className="block text-[8pt] font-normal">/ {exam.totalWeight}</span>
            </th>
            <th className={`${cell} text-center`}>{t('exams.marks.result')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.member.id}>
              <td className={`${cell} tabular text-center`}>{i + 1}</td>
              <td className={cell}>
                {memberFullName(c.member)}
                <span className="ml-2 font-mono text-[8pt] text-neutral-600">{c.member.memberCode}</span>
              </td>
              {exam.parts.map((p) => (
                <td key={p.id} className={`${cell} tabular text-center`}>
                  {c.marks[p.id] ?? ''}
                </td>
              ))}
              <td className={`${cell} tabular text-center font-semibold`}>{c.total ?? ''}</td>
              <td className={`${cell} text-center`}>
                {c.result === 'PASS' ? t('exams.marks.PASS') : c.result === 'FAIL' ? t('exams.marks.FAIL') : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
