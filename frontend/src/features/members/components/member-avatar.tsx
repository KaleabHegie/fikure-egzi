import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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

/**
 * Member photo, falling back to initials. With `zoomable`, a member who has a
 * photo can be tapped to see it full size.
 */
export function MemberAvatar({
  member,
  size = 'sm',
  className,
  zoomable = false,
}: {
  member: Pick<Member, 'id' | 'hasPhoto' | 'updatedAt' | 'firstName' | 'fatherName' | 'grandfatherName'>
  size?: keyof typeof SIZES
  className?: string
  zoomable?: boolean
}) {
  const { t } = useTranslation()
  const url = useMemberPhoto(member)
  const name = memberFullName(member)
  const [open, setOpen] = useState(false)
  const shape = cn(
    'grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground',
    SIZES[size],
    className,
  )
  const face = url ? (
    <img src={url} alt={t('members.photo.alt', { name })} className="size-full object-cover" />
  ) : (
    <span aria-hidden>{initials(name)}</span>
  )

  if (!zoomable || !url) return <span className={shape}>{face}</span>

  return (
    // React events from the dialog's portal bubble here too; keep them from
    // reaching a clickable row around the avatar.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={cn(
          shape,
          'cursor-zoom-in transition-[filter] outline-none hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
        aria-label={t('members.photo.view', { name })}
        onClick={() => setOpen(true)}
      >
        {face}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(92vw,32rem)] max-w-none gap-3 p-3 sm:max-w-none">
          <DialogTitle className="pr-8 text-base">{name}</DialogTitle>
          <DialogDescription className="sr-only">{t('members.photo.view', { name })}</DialogDescription>
          <img
            src={url}
            alt={t('members.photo.alt', { name })}
            className="max-h-[75dvh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </span>
  )
}
