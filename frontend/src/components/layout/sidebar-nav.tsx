import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useAuth } from '@/features/auth/use-auth'
import { formatEth } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'
import { NAVIGATION } from './navigation'

/** The whole sidebar: seal, grouped navigation and today's Ethiopian date. Shared by desktop and the mobile sheet. */
export function SidebarPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => new Date())
  const today = formatEth(now, 'date', i18n.language === 'am' ? 'am' : 'en')

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
        <BrandMark />
      </div>
      <div className="scrollbar-quiet flex-1 overflow-y-auto px-3 py-5">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="flex shrink-0 items-center gap-2.5 border-t border-sidebar-border px-5 py-3.5">
        <CalendarDays className="size-4 shrink-0 text-gold" aria-hidden />
        <p className="min-w-0 truncate text-xs leading-tight text-muted-foreground">
          <span className="sr-only">{t('nav.today')}: </span>
          <span className="tabular font-medium text-sidebar-foreground">{today}</span>
        </p>
      </div>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { can } = useAuth()

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.to && (!item.permission || can(item.permission))),
  })).filter((section) => section.items.length > 0)
  // A single visible group (e.g. attendance takers) needs no heading.
  const showHeadings = sections.length > 1

  return (
    <nav className="flex flex-col gap-5" aria-label={t('nav.main')}>
      {sections.map((section, i) => (
        <div key={section.titleKey ?? i} className="flex flex-col gap-1">
          {showHeadings && section.titleKey && (
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground/80">
              {t(`nav.groups.${section.titleKey}`)}
            </p>
          )}
          {section.items.map(({ key, icon: Icon, to }) => (
            <NavLink
              key={key}
              to={to!}
              end={to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex h-10 items-center gap-3 rounded-lg px-1.5 text-sm transition-colors duration-150 ease-out outline-none',
                  'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isActive
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-150 ease-out',
                      isActive
                        ? 'bg-brand text-brand-foreground shadow-sm'
                        : 'text-muted-foreground group-hover:text-sidebar-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="truncate">{t(`nav.${key}`)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
