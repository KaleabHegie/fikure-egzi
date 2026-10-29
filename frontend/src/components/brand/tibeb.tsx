import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * ጥበብ — the woven border of a netela or kemis, drawn as a band: rows of gilt
 * diamonds and seal-green crosses between two threads. Decorative only.
 */
export function Tibeb({ className }: { className?: string }) {
  const id = `tibeb-${useId().replace(/:/g, '')}`
  return (
    <svg aria-hidden focusable="false" className={cn('block h-4 w-full', className)}>
      <defs>
        <pattern id={id} width="28" height="16" patternUnits="userSpaceOnUse">
          <rect x="0" y="1" width="28" height="1.25" fill="var(--brand)" />
          <rect x="0" y="13.75" width="28" height="1.25" fill="var(--brand)" />
          {/* Diamond, with a seal-green eye. */}
          <polygon points="7,3.5 11.5,8 7,12.5 2.5,8" fill="var(--gold)" />
          <polygon points="7,6.25 8.75,8 7,9.75 5.25,8" fill="var(--brand)" />
          {/* Cross with flared ends. */}
          <rect x="20.25" y="4" width="1.5" height="8" fill="var(--brand)" />
          <rect x="17" y="7.25" width="8" height="1.5" fill="var(--brand)" />
          <circle cx="21" cy="4" r="1.1" fill="var(--gold)" />
          <circle cx="21" cy="12" r="1.1" fill="var(--gold)" />
          <circle cx="17" cy="8" r="1.1" fill="var(--gold)" />
          <circle cx="25" cy="8" r="1.1" fill="var(--gold)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

/** A small Ethiopian processional cross, for marks next to church names. */
export function EthiopianCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={cn('size-4', className)} fill="currentColor">
      <path d="M11 3h2v3.2l1.6-1.6 1.4 1.4L13 9v2h2l3-3 1.4 1.4-1.6 1.6H21v2h-3.2l1.6 1.6L18 16l-3-3h-2v2l3 3-1.4 1.4-1.6-1.6V21h-2v-3.2l-1.6 1.6L8 18l3-3v-2H9l-3 3-1.4-1.4L6.2 13H3v-2h3.2L4.6 9.4 6 8l3 3h2V9L8 6l1.4-1.4L11 6.2z" />
    </svg>
  )
}
