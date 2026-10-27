import { Loader2 } from 'lucide-react'

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-svh place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  )
}
