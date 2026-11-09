import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ExamResult } from '../types'

const pill = 'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap'

/** Passed / failed, or "pending" until every part is marked. */
export function ExamResultBadge({ result }: { result: ExamResult | null }) {
  const { t } = useTranslation()
  if (!result) return <span className="text-xs text-muted-foreground">{t('exams.marks.pending')}</span>
  return (
    <span className={cn(pill, result === 'PASS' ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive')}>
      {result === 'PASS' ? t('exams.marks.PASS') : t('exams.marks.FAIL')}
    </span>
  )
}
