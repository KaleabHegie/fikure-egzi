import { Capacitor, registerPlugin } from '@capacitor/core'

/** The Android app's own print bridge (PrintPlugin.java): the system print screen, with «Save as PDF». */
const NativePrint = registerPlugin<{ print(options: { name: string }): Promise<void> }>('Print')

/**
 * Prints the current page. Browsers (computer or phone) use their print dialog,
 * where «Save as PDF» is a printer; the Android app, whose web view has no print
 * dialog, hands the page to Android's print screen instead.
 */
export async function printPage(name = document.title) {
  if (!Capacitor.isNativePlatform()) {
    window.print()
    return
  }
  // Same preparation as a browser print (light colours, print time) until the print screen closes.
  window.dispatchEvent(new Event('beforeprint'))
  try {
    await NativePrint.print({ name: name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Fikure Egzi' })
  } finally {
    window.dispatchEvent(new Event('afterprint'))
  }
}
