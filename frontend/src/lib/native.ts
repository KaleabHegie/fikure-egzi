import { Capacitor } from '@capacitor/core'

/**
 * True inside the Android app (Capacitor), where the layout uses bottom tabs
 * instead of the sidebar. In development `?app=1` (remembered) previews the app
 * layout in a browser and `?app=0` turns it off.
 */
export function isNativeApp(): boolean {
  if (Capacitor.isNativePlatform()) return true
  if (!import.meta.env.DEV) return false
  try {
    const flag = new URLSearchParams(window.location.search).get('app')
    if (flag === '1') localStorage.setItem('fe.previewApp', '1')
    if (flag === '0') localStorage.removeItem('fe.previewApp')
    return localStorage.getItem('fe.previewApp') === '1'
  } catch {
    return false
  }
}
