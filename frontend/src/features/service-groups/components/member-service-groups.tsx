import { UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useLocalizedName } from '@/features/classes/use-localized'
import { useMemberServiceGroups } from '../api'

/** The member's service group this term, plus earlier terms as history. */
export function MemberServiceGroups({ memberId }: { memberId: number }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { data } = useMemberServiceGroups(memberId)
  const rows = data ?? []
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
        <UsersRound className="size-4 text-muted-foreground" />
        {t('serviceGroups.member.title')}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('serviceGroups.member.none')}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.term.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <Link to={`/service-groups?term=${r.term.id}`} className="font-medium hover:underline">
                {name(r.group)}
              </Link>
              <span className="text-xs text-muted-foreground">
                {name(r.term)}
                {r.term.isCurrent && ` · ${t('serviceGroups.current')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
