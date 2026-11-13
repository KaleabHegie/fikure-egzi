import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { MemberCompletion } from '../types'

/** API field name → its label key (the emergency contact's own labels need context out of the form). */
const LABEL_KEY: Record<string, string> = {
  spiritualFatherName: 'members.fields.spiritualFather',
  emergencyContactName: 'members.completion.emergencyName',
  emergencyContactRelation: 'members.completion.emergencyRelation',
  emergencyContactPhone: 'members.completion.emergencyPhone',
}

/** "Missing: photo, phone, …" or "All information is filled in". */
function useCompletionSummary() {
  const { t } = useTranslation()
  return (completion: MemberCompletion) =>
    completion.missing.length === 0
      ? t('members.completion.complete')
      : t('members.completion.missing', {
          fields: completion.missing
            .map((f) => t((LABEL_KEY[f] ?? `members.fields.${f}`) as 'members.fields.photo'))
            .join('፣ '),
        })
}

/** Red under half, gold until complete, green when everything is there. */
const tone = (percent: number) =>
  percent === 100 ? 'bg-primary' : percent >= 50 ? 'bg-gold' : 'bg-destructive'

/** A short bar with the percentage; hover (or a screen reader) lists what is missing. */
export function CompletionMeter({ completion, className }: { completion: MemberCompletion; className?: string }) {
  const { t } = useTranslation()
  const summary = useCompletionSummary()(completion)
  return (
    <div
      className={cn('flex w-16 flex-col gap-1', className)}
      title={summary}
      role="img"
      aria-label={`${t('members.completion.label')} ${completion.percent}%. ${summary}`}
    >
      <span className="tabular text-xs font-medium">{completion.percent}%</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn('block h-full rounded-full', tone(completion.percent))} style={{ width: `${completion.percent}%` }} />
      </span>
    </div>
  )
}
