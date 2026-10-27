import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'

/**
 * What a member's QR code encodes: just their member ID (e.g. "FE-00042"), so
 * any phone scanner shows it, and future attendance scanning can look it up.
 */
export const memberQrPayload = (memberCode: string) => memberCode

/** PNG data URL of a QR code. Quiet zone kept small; 'M' correction survives print wear. */
export function qrDataUrl(text: string, size = 512): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })
}

export function useQrDataUrl(text: string | undefined, size = 512) {
  return useQuery({
    queryKey: ['qr', text, size],
    queryFn: () => qrDataUrl(text!, size),
    enabled: Boolean(text),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
}
