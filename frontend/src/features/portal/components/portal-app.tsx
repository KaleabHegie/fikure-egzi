import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  House,
  LogOut,
  Moon,
  QrCode,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import logoUrl from '@/assets/logo.png'
import { Tibeb } from '@/components/brand/tibeb'
import { LanguageSwitch } from '@/components/layout/preferences'
import { useAndroidBack } from '@/components/layout/use-android-back'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { MemberAttendancePanel } from '@/features/attendance/components/member-attendance-panel'
import { presetRange } from '@/features/attendance/components/period-filter'
import { useGradeLabel } from '@/features/classes/use-localized'
import { MemberCoursesPanel } from '@/features/courses/components/member-courses-panel'
import { useMemberExams } from '@/features/exams/api'
import { MemberExamsPanel } from '@/features/exams/components/member-exams-panel'
import { memberFullName } from '@/features/members/utils'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { portalApi, type PortalMember } from '../api'
import { ClassesCard, ContactCard, DepartmentsCard, MemberPhoto, PersonalCard } from './portal-sections'

type TabKey = 'home' | 'exams' | 'attendance' | 'me'
const TABS: { key: TabKey; icon: LucideIcon }[] = [
  { key: 'home', icon: House },
  { key: 'exams', icon: ClipboardCheck },
  { key: 'attendance', icon: CalendarCheck },
  { key: 'me', icon: UserRound },
]

/**
 * A member's own page on a phone (the Android app and phone browsers): a member card
 * up top, the QR code full-size on request, and a bottom tab bar instead of one long page.
 */
export function PortalApp({
  m,
  photo,
  qr,
  onSignOut,
}: {
  m: PortalMember
  photo: string | null
  qr: string | undefined
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  useAndroidBack()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabKey = TABS.some((x) => x.key === raw) ? (raw as TabKey) : 'home'
  const qrOpen = params.get('qr') === '1'

  // Tabs and the QR sheet live in the URL, so the phone's back button steps back through them.
  const go = (next: TabKey) => {
    if (next === tab) return
    setParams(next === 'home' ? {} : { tab: next })
    window.scrollTo({ top: 0 })
  }
  const showQr = (open: boolean) => {
    const next = new URLSearchParams(params)
    if (open) {
      next.set('qr', '1')
      setParams(next)
    } else if (qrOpen) {
      // Opened from this page: going back closes it and keeps the history tidy.
      window.history.back()
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="sticky top-0 z-30 bg-background pt-[env(safe-area-inset-top)]">
        <Tibeb scale={0.75} />
        <header className="flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-full bg-white" />
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {tab === 'home' ? t('portal.app.hello', { name: m.firstName }) : t(`portal.app.tabs.${tab}`)}
          </h1>
          <button
            type="button"
            onClick={() => showQr(true)}
            aria-label={t('portal.app.showQr')}
            className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary active:bg-primary/20"
          >
            <QrCode className="size-5" aria-hidden />
          </button>
        </header>
      </div>

      <main key={tab} className="rise-in space-y-3 px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {tab === 'home' && <HomeTab m={m} photo={photo} onQr={() => showQr(true)} onGo={go} />}
        {tab === 'exams' && (
          <MemberExamsPanel memberId={m.id} load={portalApi.exams} linkExams={false} emptyText={t('portal.noExams')} />
        )}
        {tab === 'attendance' && <MemberAttendancePanel memberId={m.id} load={portalApi.attendance} linkSessions={false} />}
        {tab === 'me' && <MeTab m={m} onSignOut={onSignOut} />}
      </main>

      <nav
        aria-label={t('portal.app.nav')}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="grid h-16 grid-cols-4 items-center">
          {TABS.map(({ key, icon: Icon }) => {
            const active = tab === key
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => go(key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 text-[11px] font-semibold outline-none',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span className={cn('grid h-7 w-14 place-items-center rounded-full transition-colors', active && 'bg-primary/12')}>
                    <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  </span>
                  <span className="max-w-full truncate px-1">{t(`portal.app.tabs.${key}`)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <Sheet open={qrOpen} onOpenChange={(open) => showQr(open)}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="items-center gap-0 rounded-t-3xl bg-white px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-neutral-900"
        >
          <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-neutral-300" aria-hidden />
          <SheetTitle className="text-center text-lg font-semibold text-neutral-900">{memberFullName(m)}</SheetTitle>
          <SheetDescription className="mb-4 text-center text-sm text-neutral-600">{t('portal.app.qrHint')}</SheetDescription>
          {qr && <img src={qr} alt={`QR ${m.memberCode}`} className="mx-auto size-64 max-w-full" />}
          <p className="mt-3 text-center font-mono text-xl font-bold tracking-wide text-[#076B13]">{m.memberCode}</p>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function HomeTab({
  m,
  photo,
  onQr,
  onGo,
}: {
  m: PortalMember
  photo: string | null
  onQr: () => void
  onGo: (tab: TabKey) => void
}) {
  const { t } = useTranslation()
  const gradeLabel = useGradeLabel()
  const exams = useMemberExams(m.id, portalApi.exams)
  // Same period the attendance tab opens on (this year), so the numbers match when tapped through.
  const [year] = useState(() => presetRange('year'))
  const attendance = useQuery({
    queryKey: ['portal', 'attendance-year', year.from, year.to],
    queryFn: () => portalApi.attendance({ from: year.from || undefined, to: year.to || undefined }),
  })
  const passed = exams.data?.filter((e) => e.result === 'PASS').length ?? 0
  const firstClass = m.classes[0]

  return (
    <>
      {/* The member card: what they show, and who they are, at a glance. */}
      <section className="relative overflow-hidden rounded-3xl bg-brand p-5 text-brand-foreground shadow-sm">
        <div className="pattern-cross absolute inset-0 opacity-[0.07]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gold" aria-hidden />
        <div className="relative flex items-center gap-4">
          <MemberPhoto member={m} photo={photo} className="size-18 text-xl ring-3 ring-gold/70" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-brand-foreground/70">{t('portal.app.memberCard')}</p>
            <p className="text-lg leading-snug font-semibold">{memberFullName(m)}</p>
            {m.christianName && <p className="truncate text-sm text-brand-foreground/75">{m.christianName}</p>}
          </div>
        </div>
        <div className="relative mt-4 flex items-center justify-between gap-3">
          <span className="rounded-lg bg-white/12 px-3 py-1.5 font-mono text-base font-bold tracking-wide">{m.memberCode}</span>
          <button
            type="button"
            onClick={onQr}
            className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#076B13] shadow-sm active:scale-[0.98]"
          >
            <QrCode className="size-4" aria-hidden />
            {t('portal.app.showQr')}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label={t('portal.app.rate')}
          value={attendance.data?.rate != null ? `${attendance.data.rate}%` : '—'}
          sub={t('portal.app.sessions', { count: attendance.data?.sessions ?? 0 })}
          onClick={() => onGo('attendance')}
        />
        <Tile
          label={t('portal.app.exams')}
          value={exams.data ? String(exams.data.length) : '—'}
          sub={t('portal.app.passed', { count: passed })}
          onClick={() => onGo('exams')}
        />
        <Tile
          label={t('portal.app.class')}
          value={firstClass ? gradeLabel(firstClass.classGrade) : '—'}
          sub={m.classes.length > 1 ? t('portal.app.moreClasses', { count: m.classes.length - 1 }) : ' '}
        />
      </div>

      <ClassesCard m={m} />
      <DepartmentsCard m={m} />
      <MemberCoursesPanel memberId={m.id} load={portalApi.courses} linkRuns={false} />
    </>
  )
}

function Tile({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="tabular mt-1 block truncate text-xl font-bold">{value}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
    </>
  )
  const cls = 'min-w-0 rounded-2xl border bg-card px-3 py-3 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'active:bg-accent')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function MeTab({ m, onSignOut }: { m: PortalMember; onSignOut: () => void }) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <>
      <PersonalCard m={m} />
      <ContactCard m={m} />
      <section className="divide-y rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm">{t('preferences.language')}</span>
          <LanguageSwitch />
        </div>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm active:bg-accent"
        >
          <span>{t('preferences.theme')}</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {resolvedTheme === 'dark' ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
            {resolvedTheme === 'dark' ? t('preferences.dark') : t('preferences.light')}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </button>
      </section>
      <p className="px-1 text-xs text-muted-foreground">{t('portal.app.wrongDetails')}</p>
      <button
        type="button"
        onClick={onSignOut}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 font-semibold text-destructive active:bg-destructive/10"
      >
        <LogOut className="size-4" aria-hidden />
        {t('portal.signOut')}
      </button>
    </>
  )
}
