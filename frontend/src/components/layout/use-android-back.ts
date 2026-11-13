import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'

/** Android's back button: close whatever is open on top, else go back, else leave the app. */
export function useAndroidBack() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
      // Radix sheets, dialogs and menus, and the full-screen scanner, all close on Escape.
      const layer = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-back-closes]',
      )
      if (layer) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return
      }
      if (canGoBack) navigate(-1)
      else void CapApp.exitApp()
    })
    return () => {
      void handle.then((h) => h.remove())
    }
  }, [navigate])
}
