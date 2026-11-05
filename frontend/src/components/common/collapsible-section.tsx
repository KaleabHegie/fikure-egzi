import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A section card whose whole header is a disclosure button. Content stays
 * mounted while collapsed (queries keep their data); height animates via the
 * grid-rows trick, skipped under reduced motion.
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  description,
  meta,
  defaultOpen = true,
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  /** Right-aligned summary (for example a count), visible open or closed. */
  meta?: React.ReactNode
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-brand" aria-hidden>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-semibold">{title}</span>
          {description && <span className="block truncate text-sm text-muted-foreground">{description}</span>}
        </span>
        {meta && <span className="shrink-0 text-sm text-muted-foreground">{meta}</span>}
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t">{children}</div>
        </div>
      </div>
    </section>
  )
}
