/**
 * Indent plus a faint branch line that nests an item under its parent in a
 * dropdown (sub-departments under their department). Nothing at depth 0.
 */
export function TreeMark({ depth }: { depth: number }) {
  if (depth <= 0) return null
  return (
    <span aria-hidden className="flex shrink-0 justify-end text-muted-foreground/60" style={{ width: `${depth}rem` }}>
      └
    </span>
  )
}
