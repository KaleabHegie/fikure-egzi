import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** How far (px, after resistance) the page must be pulled to refresh. */
const TRIGGER = 64
const MAX = 96

/**
 * The app's pull-to-refresh: pulling the page down from the very top reloads
 * the data on screen (what is typed and not saved stays). The Android web view
 * has none of its own; browsers do, so this is only mounted in the app.
 */
export function PullToRefresh() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    let startY: number | null = null
    let distance = 0

    const onStart = (e: TouchEvent) => {
      startY = null
      if (busyRef.current || e.touches.length !== 1 || window.scrollY > 0) return
      // Not from inside a dialog or sheet, nor while one is open.
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[role="dialog"], [data-no-pull]') || document.querySelector('[role="dialog"]')) return
      startY = e.touches[0]!.clientY
      distance = 0
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      const dy = e.touches[0]!.clientY - startY
      if (dy <= 0 || window.scrollY > 0) {
        startY = null
        distance = 0
        setPull(0)
        return
      }
      distance = Math.min(dy * 0.5, MAX)
      setPull(distance)
    }
    const onEnd = () => {
      if (startY === null) return
      startY = null
      if (distance < TRIGGER) {
        setPull(0)
        return
      }
      busyRef.current = true
      setBusy(true)
      setPull(TRIGGER)
      // At least a moment of spinning, so a quick refresh is still seen.
      const pause = new Promise((resolve) => setTimeout(resolve, 600))
      void Promise.allSettled([queryClient.refetchQueries({ type: 'active' }), pause]).then(() => {
        busyRef.current = false
        setBusy(false)
        setPull(0)
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [queryClient])

  const ready = pull >= TRIGGER
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 flex justify-center print:hidden"
      style={{
        transform: `translateY(${pull - 48}px)`,
        opacity: busy ? 1 : Math.min(pull / TRIGGER, 1),
        transition: pull === 0 || busy ? 'transform 200ms, opacity 200ms' : undefined,
      }}
    >
      {(pull > 0 || busy) && (
        <span className="grid size-10 place-items-center rounded-full border bg-card text-primary shadow-md">
          <RefreshCw
            className={cn('size-5', busy && 'animate-spin', !busy && ready && 'text-brand')}
            style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }}
            aria-hidden
          />
          {busy && <span className="sr-only">{t('common.refreshing')}</span>}
        </span>
      )}
    </div>
  )
}
