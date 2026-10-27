import { Camera, CameraOff } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** Reads one QR code with the camera and hands back its text (the member ID). */
export function QrCamera({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = () => {
    scannerRef.current?.stop()
    setOn(false)
  }

  const start = async () => {
    setError(null)
    if (!videoRef.current) return
    try {
      if (!(await QrScanner.hasCamera())) {
        setError(t('attendance.scan.noCamera'))
        return
      }
      scannerRef.current ??= new QrScanner(
        videoRef.current,
        (result) => {
          onCode(result.data.trim())
          stop()
        },
        { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
      )
      await scannerRef.current.start()
      setOn(true)
    } catch {
      setError(t('attendance.scan.cameraDenied'))
    }
  }

  useEffect(() => () => scannerRef.current?.destroy(), [])

  return (
    <div className="space-y-2">
      <div className={on ? 'overflow-hidden rounded-lg border bg-black' : 'hidden'}>
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => (on ? stop() : void start())}>
        {on ? <CameraOff /> : <Camera />}
        {on ? t('portal.stopCamera') : t('portal.scanQr')}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
