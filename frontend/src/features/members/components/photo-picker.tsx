import { Camera, Loader2, Trash2, UserRound } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ACCEPTED_IMAGE_TYPES, downscaleImage, MAX_SOURCE_IMAGE_BYTES } from '@/lib/image'
import type { PhotoChange } from '../api'

/**
 * Photo input for the member form. It does not upload anything itself: it
 * reports a PhotoChange, which the page applies after the record is saved.
 */
export function PhotoPicker({
  currentUrl,
  change,
  onChange,
  disabled,
}: {
  /** The saved photo, if any. */
  currentUrl: string | null
  change: PhotoChange
  onChange: (change: PhotoChange) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const pendingFile = change.kind === 'set' ? change.file : null
  const pendingUrl = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile])
  useEffect(() => () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
  }, [pendingUrl])

  const shownUrl = change.kind === 'remove' ? null : (pendingUrl ?? currentUrl)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      setError(t('members.photo.invalidType'))
      return
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setError(t('members.photo.tooLarge'))
      return
    }
    setProcessing(true)
    try {
      onChange({ kind: 'set', file: await downscaleImage(file) })
    } catch {
      setError(t('members.photo.unreadable'))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
        {processing ? (
          <Loader2 className="size-6 animate-spin" />
        ) : shownUrl ? (
          <img src={shownUrl} alt="" className="size-full object-cover" />
        ) : (
          <UserRound className="size-10" aria-hidden />
        )}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            className="sr-only"
            disabled={disabled || processing}
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = '' // allow choosing the same file again
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || processing}
            onClick={() => inputRef.current?.click()}
          >
            <Camera />
            {shownUrl ? t('members.photo.change') : t('members.photo.upload')}
          </Button>
          {shownUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || processing}
              onClick={() => onChange(currentUrl ? { kind: 'remove' } : { kind: 'keep' })}
            >
              <Trash2 />
              {t('members.photo.remove')}
            </Button>
          )}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('members.photo.hint')}</p>
        )}
      </div>
    </div>
  )
}
