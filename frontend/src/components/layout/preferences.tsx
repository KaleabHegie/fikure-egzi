import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LANGUAGES } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/** EN / አማ switch. The choice persists (see src/i18n). */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('preferences.language')}
      className={cn('inline-flex h-8 items-center rounded-lg border bg-background p-0.5', className)}
    >
      <Languages className="mx-1.5 size-3.5 text-muted-foreground" aria-hidden />
      {LANGUAGES.map((lang) => {
        const active = i18n.language === lang.code
        return (
          <button
            key={lang.code}
            type="button"
            lang={lang.code}
            aria-pressed={active}
            title={lang.label}
            onClick={() => void i18n.changeLanguage(lang.code)}
            className={cn(
              'h-full rounded-md px-2 text-xs font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {lang.short}
          </button>
        )
      })}
    </div>
  )
}

const THEMES = [
  { value: 'light', icon: Sun, key: 'preferences.light' },
  { value: 'dark', icon: Moon, key: 'preferences.dark' },
  { value: 'system', icon: Monitor, key: 'preferences.system' },
] as const

/** Light / dark / follow-the-device. Persisted in localStorage (see lib/theme). */
export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('preferences.theme')}>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, icon: Icon, key }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon />
            {t(key)}
            {theme === value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
