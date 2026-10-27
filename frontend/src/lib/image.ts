export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * Shrinks a photo in the browser before upload (longest side ≤ maxSize,
 * re-encoded as JPEG). Phone photos are often 4–8 MB; this makes them
 * ~100 KB, which matters on cPanel disk quotas and slow connections.
 */
export async function downscaleImage(file: Blob, maxSize = 640, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.fillStyle = '#fff' // flatten transparent PNGs onto white
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))), 'image/jpeg', quality),
    )
  } finally {
    bitmap.close()
  }
}
