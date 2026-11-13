import { useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck,
  ChevronRight,
  Ellipsis,
  House,
  Loader2,
  LogOut,
  Moon,
  ScanLine,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { attendanceApi, attendanceKeys, type SessionListParams } from '@/features/attendance/api'
import { addisDate, sessionTimes } from '@/features/attendance/time'
import type { AttendanceSession } from '@/features/attendance/types'
import { useAuth } from '@/features/auth/use-auth'
import { getErrorMessage } from '@/lib/api/errors'
import { formatEth } from '@/lib/ethiopian-calendar'
import { initials } from '@/lib/format'
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { NAVIGATION, type NavItem } from './navigation'
import { LanguageSwitch } from './preferences'

/*
 * The Android app's navigation: a bottom tab bar with the scanner in the middle and a
 * «More» sheet holding every other page. The website keeps the sidebar.
 */

interface Tab {
  key: 'home' | 'members' | 'attendance'
  to: string
  icon: LucideIcon
  permission: PermissionCode
  match: (path: string) => boolean
}

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`)

const TABS: Tab[] = [
  { key: 'home', to: '/', icon: House, permission: PERMISSIONS.MEMBERS_READ, match: (p) => p === '/' },
  { key: 'members', to: '/members', icon: Users, permission: PERMISSIONS.MEMBERS_READ, match: under('/members') },
  {
    key: 'attendance',
    to: '/attendance',
    icon: CalendarCheck,
    permission: PERMISSIONS.ATTENDANCE_READ,
    // Reports and permissions live in «More»; the tab is the sessions list and a session.
    match: (p) => under('/attendance')(p) && !under('/attendance/reports')(p) && !under('/attendance/permissions')(p),
  },
]

const KNOWN_ROLES = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'ATTENDANCE_TAKER', 'TEACHER'] as const
type KnownRole = (typeof KNOWN_ROLES)[number]

export function AppTabs() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [moreOpen, setMoreOpen] = useState(false)
  const [picking, setPicking] = useState<AttendanceSession[] | null>(null)
  const [finding, setFinding] = useState(false)

  const tabs = TABS.filter((tab) => can(tab.permission))
  const canScan = can(PERMISSIONS.ATTENDANCE_TAKE)
  const onTab = tabs.some((tab) => tab.match(pathname))

  /** The scan button goes to today's open session, asks which one when there are several. */
  const scan = async () => {
    if (finding) return
    setFinding(true)
    try {
      const today = addisDate(new Date().toISOString())
      const params: SessionListParams = { page: 1, pageSize: 20, status: 'OPEN', from: today, to: today }
      const page = await qc.fetchQuery({
        queryKey: attendanceKeys.sessions(params),
        queryFn: () => attendanceApi.list(params),
        staleTime: 15_000,
      })
      const open = page.data
      if (open.length === 1) navigate(`/attendance/${open[0]!.id}`)
      else if (open.length > 1) setPicking(open)
      else {
        toast.info(t('nav.tabs.noOpenSession'))
        navigate('/attendance')
      }
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setFinding(false)
    }
  }

  // Items in the order shown; the scanner sits in the middle.
  const items: React.ReactNode[] = tabs.map((tab) => (
    <TabLink
      key={tab.key}
      to={tab.to}
      icon={tab.icon}
      label={tab.key === 'home' ? t('nav.tabs.home') : t(`nav.${tab.key}`)}
      active={!moreOpen && tab.match(pathname)}
    />
  ))
  items.push(
    <TabButton
      key="more"
      icon={Ellipsis}
      label={t('nav.tabs.more')}
      active={moreOpen || !onTab}
      onClick={() => setMoreOpen(true)}
    />,
  )
  if (canScan) {
    items.splice(
      Math.floor(items.length / 2),
      0,
      <li key="scan" className="flex justify-center">
        <button
          type="button"
          onClick={() => void scan()}
          aria-label={t('nav.tabs.scan')}
          className="-mt-7 flex flex-col items-center gap-1 text-[11px] font-semibold text-primary outline-none"
        >
          <span className="grid size-15 place-items-center rounded-full border-4 border-background bg-brand text-brand-foreground shadow-lg transition-transform active:scale-95">
            {finding ? <Loader2 className="size-7 animate-spin" aria-hidden /> : <ScanLine className="size-7" aria-hidden />}
          </span>
          {t('nav.tabs.scan')}
        </button>
      </li>,
    )
  }

  return (
    <>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="grid h-16 items-center" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items}
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} hidePaths={tabs.map((tab) => tab.to)} />

      <Sheet open={picking !== null} onOpenChange={(o) => !o && setPicking(null)}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[80svh] gap-0 overflow-y-auto rounded-t-3xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <Handle />
          <SheetTitle className="text-lg font-semibold">{t('nav.tabs.pickSession')}</SheetTitle>
          <SheetDescription className="mb-3">{t('nav.tabs.pickSessionHint')}</SheetDescription>
          <ul className="space-y-2">
            {picking?.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(null)
                    navigate(`/attendance/${s.id}`)
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left active:bg-accent"
                >
                  <ScanLine className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{sessionTimes(s.startsAt, s.endsAt)}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

function TabLink({ to, icon: Icon, label, active }: { to: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <li>
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center gap-1 text-[11px] font-semibold outline-none',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
        <span className="max-w-full truncate px-1">{label}</span>
      </Link>
    </li>
  )
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full flex-col items-center gap-1 text-[11px] font-semibold outline-none',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
        <span className="max-w-full truncate px-1">{label}</span>
      </button>
    </li>
  )
}

const Handle = () => <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-muted-foreground/25" aria-hidden />

interface MoreLink {
  key: string
  to: string
  icon: LucideIcon
  label: string
}

/** Every page the user may open that isn't a tab, grouped as in the sidebar. */
function useMoreSections(hidePaths: string[]) {
  const { t } = useTranslation()
  const { can } = useAuth()
  const allowed = (p?: PermissionCode) => !p || can(p)
  return NAVIGATION.map((section) => {
    const links: MoreLink[] = section.items
      .filter((item: NavItem) => allowed(item.permission))
      .flatMap((item): MoreLink[] =>
        item.children
          ? item.children
              .filter((c) => allowed(c.permission))
              .map((c) => ({ key: c.key, to: c.to, icon: c.icon ?? item.icon, label: t(`nav.${c.fullKey ?? c.key}`) }))
          : item.to
            ? [{ key: item.key, to: item.to, icon: item.icon, label: t(`nav.${item.key}`) }]
            : [],
      )
      .filter((l) => !hidePaths.includes(l.to))
    return { titleKey: section.titleKey, links }
  }).filter((s) => s.links.length > 0)
}

function MoreSheet({
  open,
  onOpenChange,
  hidePaths,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hidePaths: string[]
}) {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const sections = useMoreSections(hidePaths)
  const [now] = useState(() => new Date())
  const today = formatEth(now, 'date', i18n.language === 'am' ? 'am' : 'en')

  // Drag the top of the sheet down to close it.
  const panel = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const drag = {
    onTouchStart: (e: React.TouchEvent) => {
      startY.current = e.touches[0]!.clientY
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (startY.current === null || !panel.current) return
      const dy = Math.max(0, e.touches[0]!.clientY - startY.current)
      panel.current.style.transform = `translateY(${dy}px)`
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startY.current === null || !panel.current) return
      const dy = e.changedTouches[0]!.clientY - startY.current
      startY.current = null
      panel.current.style.transform = ''
      if (dy > 80) onOpenChange(false)
    },
  }

  if (!user) return null
  const role = user.roles
    .map((r) => (KNOWN_ROLES.includes(r as KnownRole) ? t(`userMenu.roles.${r as KnownRole}`) : r))
    .join(', ')
  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={panel}
        side="bottom"
        showCloseButton={false}
        className="max-h-[88svh] gap-0 overflow-y-auto rounded-t-3xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div {...drag}>
          <Handle />
          <SheetTitle className="sr-only">{t('nav.tabs.moreTitle')}</SheetTitle>
          <SheetDescription className="sr-only">{t('nav.tabs.moreDescription')}</SheetDescription>
          <button
            type="button"
            onClick={() => go('/profile')}
            className="flex w-full items-center gap-3 rounded-2xl bg-muted/70 p-3 text-left active:bg-accent"
          >
            <Avatar className="size-11">
              <AvatarFallback className="bg-brand font-semibold text-brand-foreground">{initials(user.fullName)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{user.fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {role} · {t('userMenu.profile')}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <LanguageSwitch className="h-10 w-full justify-center rounded-xl" />
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl border bg-background text-sm font-medium"
          >
            {resolvedTheme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            {resolvedTheme === 'dark' ? t('nav.tabs.darkOff') : t('nav.tabs.darkOn')}
          </button>
          <p className="flex h-10 items-center justify-center truncate rounded-xl border bg-background px-2 text-xs font-medium">
            <span className="sr-only">{t('nav.today')}: </span>
            {today}
          </p>
        </div>

        {sections.map((section, i) => (
          <section key={section.titleKey ?? i} className="mt-4">
            {section.titleKey && (
              <h3 className="mb-1.5 px-1 text-xs font-semibold text-gold">{t(`nav.groups.${section.titleKey}`)}</h3>
            )}
            <ul className="grid grid-cols-4 gap-1">
              {section.links.map(({ key, to, icon: Icon, label }) => {
                const active = pathname === to || pathname.startsWith(`${to}/`)
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => go(to)}
                      aria-current={active ? 'page' : undefined}
                      className="flex w-full flex-col items-center gap-1.5 rounded-2xl px-0.5 py-2 text-center text-[11px] leading-tight font-medium active:bg-accent"
                    >
                      <span
                        className={cn(
                          'grid size-11 place-items-center rounded-2xl',
                          active ? 'bg-primary text-primary-foreground' : 'bg-primary/12 text-primary',
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <button
          type="button"
          onClick={async () => {
            onOpenChange(false)
            await logout()
            navigate('/login', { replace: true })
          }}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 font-semibold text-destructive active:bg-destructive/10"
        >
          <LogOut className="size-4" aria-hidden />
          {t('userMenu.signOut')}
        </button>
      </SheetContent>
    </Sheet>
  )
}
