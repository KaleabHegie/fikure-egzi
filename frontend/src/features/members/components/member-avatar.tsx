import { useTranslation } from 'react-i18next'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMemberPhoto } from '../api'
import type { Member } from '../types'
import { memberFullName } from '../utils'

const SIZES = {
  sm: 'size-8 text-[11px]',
  md: 'size-12 text-sm',
  lg: 'size-20 text-xl',
} as const

/** Member photo, falling back to initials. */
export function MemberAvatar({
  member,
  size = 'sm',
  className,
}: {
  member: Pick<Member, 'id' | 'hasPhoto' | 'updatedAt' | 'firstName' | 'fatherName' | 'grandfatherName'>
  size?: keyof typeof SIZES
  className?: string
}) {
  const { t } = useTranslation()
  const url = useMemberPhoto(member)
  const name = memberFullName(member)
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground',
        SIZES[size],
        className,
      )}
    >
      {url ? (
        <img src={url} alt={t('members.photo.alt', { name })} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  )
}
