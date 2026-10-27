import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Same key as the pre-paint script in index.html. */
const STORAGE_KEY = 'fe.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // storage unavailable
  }
  return 'system'
}

function subscribeSystem(onChange: () => void) {
  const mql = media()
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Light / dark / system theme. Applies the `dark` class on <html> (shadcn's
 * convention). index.html sets it before first paint to avoid a flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const systemDark = useSyncExternalStore(subscribeSystem, () => media().matches, () => false)
  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
