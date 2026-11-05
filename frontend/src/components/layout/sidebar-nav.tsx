import { CalendarDays, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/use-auth'
import { formatEth } from '@/lib/ethiopian-calendar'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'
import { NAVIGATION, type NavItem } from './navigation'

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

function NavLeaf({
  itemKey,
  icon: Icon,
  to,
  onNavigate,
}: {
  itemKey: NavItem['key']
  icon: NavItem['icon']
  to: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={to}
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
          <span className="truncate">{t(`nav.${itemKey}`)}</span>
        </>
      )}
    </NavLink>
  )
}

/** An item with sub-pages: a disclosure row with indented child links. */
function NavGroup({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const children = item.children!
  // The longest matching child is the active one (so /attendance/reports lights Reports, not Sessions).
  const activeTo = children
    .filter((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to
  const [open, setOpen] = useState(Boolean(activeTo))
  // Navigating into the section opens the group (adjusting state during render,
  // React's recommended alternative to a syncing effect).
  const [openedFor, setOpenedFor] = useState(activeTo)
  if (activeTo && openedFor !== activeTo) {
    setOpenedFor(activeTo)
    setOpen(true)
  }
  const Icon = item.icon

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex h-10 w-full items-center gap-3 rounded-lg px-1.5 text-sm font-medium text-sidebar-foreground/75 transition-colors duration-150 ease-out outline-none hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-150 ease-out',
            activeTo
              ? 'bg-brand text-brand-foreground shadow-sm'
              : 'text-muted-foreground group-hover:text-sidebar-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{t(`nav.${item.key}`)}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 mb-1 ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2.5">
            {children.map((c) => (
              <NavLink
                key={c.key}
                to={c.to}
                onClick={onNavigate}
                className={cn(
                  'flex h-9 items-center rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  activeTo === c.to
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <span className="truncate">{t(`nav.${c.key}`)}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { can } = useAuth()

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items
      .map((item) =>
        item.children
          ? { ...item, children: item.children.filter((c) => !c.permission || can(c.permission)) }
          : item,
      )
      .filter((item) =>
        item.children
          ? item.children.length > 0 && (!item.permission || can(item.permission))
          : item.to && (!item.permission || can(item.permission)),
      ),
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
          {section.items.map((item) =>
            item.children && item.children.length > 1 ? (
              <NavGroup key={item.key} item={item} onNavigate={onNavigate} />
            ) : (
              <NavLeaf
                key={item.key}
                itemKey={item.key}
                icon={item.icon}
                to={item.children ? item.children[0]!.to : item.to!}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      ))}
    </nav>
  )
}
