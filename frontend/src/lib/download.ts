import { Capacitor, registerPlugin } from '@capacitor/core'
import { toast } from 'sonner'
import i18n from '@/i18n'

type SavedTo = 'pictures' | 'downloads' | 'shared'

/** The Android app's own file saver (FilesPlugin.java): Pictures or Downloads, or the share screen. */
const NativeFiles = registerPlugin<{
  save(options: { name: string; mimeType: string; data: string }): Promise<{ location: SavedTo }>
}>('Files')

/** The file's bytes as base64, without the "data:…;base64," prefix. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Saves a Blob as a file. Browsers download it; the Android app, whose web
 * view ignores download links, saves it to Pictures (images) or Downloads and
 * says where.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  try {
    const { location } = await NativeFiles.save({
      name: filename,
      mimeType: blob.type || 'application/octet-stream',
      data: await toBase64(blob),
    })
    if (location !== 'shared') toast.success(i18n.t(`common.savedTo.${location}`, { name: filename }))
  } catch {
    toast.error(i18n.t('common.saveFailed'))
  }
}

/** Saves a data: URL (e.g. a QR image) as a file. */
export async function saveDataUrl(dataUrl: string, filename: string): Promise<void> {
  await saveBlob(await (await fetch(dataUrl)).blob(), filename)
}
