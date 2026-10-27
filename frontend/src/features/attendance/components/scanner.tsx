import { Camera, CameraOff, Loader2, ScanLine } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** The same card held in front of the camera is read many times a second; ignore repeats briefly. */
const REPEAT_WINDOW_MS = 3000

/**
 * Camera QR scanner plus an ID box. USB/handheld scanners act as keyboards
 * (type the ID, then Enter), so the box doubles as their input.
 */
export function Scanner({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const onCodeRef = useRef(onCode)
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cameraError, setCameraError] = useState<'none' | 'denied' | null>(null)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(
    () => () => {
      scannerRef.current?.destroy()
      scannerRef.current = null
    },
    [],
  )

  const emit = (raw: string) => {
    const code = raw.trim()
    if (!code) return
    const now = Date.now()
    if (code === lastRef.current.code && now - lastRef.current.at < REPEAT_WINDOW_MS) return
    lastRef.current = { code, at: now }
    onCodeRef.current(code)
  }

  const start = async () => {
    if (!videoRef.current) return
    setStarting(true)
    setCameraError(null)
    try {
      if (!(await QrScanner.hasCamera())) {
        setCameraError('none')
        return
      }
      scannerRef.current ??= new QrScanner(videoRef.current, (result) => emit(result.data), {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
      })
      await scannerRef.current.start()
      setRunning(true)
    } catch {
      setCameraError('denied')
    } finally {
      setStarting(false)
    }
  }

  const stop = () => {
    scannerRef.current?.stop()
    setRunning(false)
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-900">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {!running && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-neutral-300">
            <div className="space-y-3">
              <ScanLine className="mx-auto size-8 opacity-70" />
              {cameraError && (
                <p className="max-w-xs">{cameraError === 'none' ? t('attendance.scan.noCamera') : t('attendance.scan.cameraDenied')}</p>
              )}
              <Button type="button" onClick={() => void start()} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <Camera />}
                {t('attendance.scan.start')}
              </Button>
            </div>
          </div>
        )}
        {running && (
          <Button type="button" size="sm" variant="secondary" className="absolute top-2 right-2" onClick={stop}>
            <CameraOff />
            {t('attendance.scan.stop')}
          </Button>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          // Typed entries always submit, even if the same ID was just scanned.
          lastRef.current = { code: '', at: 0 }
          emit(typed)
          setTyped('')
        }}
      >
        <Input
          aria-label={t('attendance.scan.manualLabel')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="font-mono"
        />
        <Button type="submit" disabled={busy || !typed.trim()}>
          {busy && <Loader2 className="animate-spin" />}
          {t('attendance.scan.submit')}
        </Button>
      </form>
    </div>
  )
}
