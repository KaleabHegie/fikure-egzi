import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Result, RunPhase } from '../types'

const PHASE_STYLES: Record<RunPhase, string> = {
  upcoming: 'bg-accent text-accent-foreground',
  ongoing: 'bg-success/12 text-success',
  finished: 'bg-muted text-muted-foreground',
}

const pill = 'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap'

export function PhaseBadge({ phase }: { phase: RunPhase }) {
  const { t } = useTranslation()
  return <span className={cn(pill, PHASE_STYLES[phase])}>{t(`courses.phases.${phase}`)}</span>
}

export function ResultBadge({ result }: { result: Result | null }) {
  const { t } = useTranslation()
  if (!result) return <span className="text-xs text-muted-foreground">{t('courses.marks.pending')}</span>
  return (
    <span className={cn(pill, result === 'PASS' ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive')}>
      {t(`courses.marks.${result}`)}
    </span>
  )
}
