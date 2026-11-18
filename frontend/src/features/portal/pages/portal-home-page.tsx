import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { FullPageSpinner } from '@/components/common/full-page-spinner'
import { BrandMark } from '@/components/layout/brand-mark'
import { LanguageSwitch, ThemeToggle } from '@/components/layout/preferences'
import { Button } from '@/components/ui/button'
import { MemberAttendancePanel } from '@/features/attendance/components/member-attendance-panel'
import { MemberCoursesPanel } from '@/features/courses/components/member-courses-panel'
import { MemberExamsPanel } from '@/features/exams/components/member-exams-panel'
import { memberFullName } from '@/features/members/utils'
import { toApiError } from '@/lib/api/errors'
import { memberQrPayload, useQrDataUrl } from '@/lib/qr'
import { useMediaQuery } from '@/lib/use-media-query'
import { portalApi, portalSession, usePortalMember, usePortalPhoto } from '../api'
import { PortalApp } from '../components/portal-app'
import { ClassesCard, ContactCard, DepartmentsCard, MemberPhoto, PersonalCard } from '../components/portal-sections'

/**
 * A member's own page: profile, classes and departments, exams, attendance and their QR code.
 * Phones (and the Android app) get an app layout with bottom tabs; wider screens one page.
 */
export function PortalHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const phone = useMediaQuery('(max-width: 767px)')
  const me = usePortalMember()
  const photo = usePortalPhoto(me.data)
  const { data: qr } = useQrDataUrl(me.data ? memberQrPayload(me.data.memberCode) : undefined, 480)

  const signOut = () => {
    portalSession.clear()
    qc.removeQueries({ queryKey: ['portal'] })
    navigate('/portal', { replace: true })
  }

  // An expired or invalid sign-in goes back to the sign-in page.
  const expired = me.isError && toApiError(me.error).status === 401
  useEffect(() => {
    if (expired) portalSession.clear()
  }, [expired])

  if (!portalSession.get() || expired) return <Navigate to="/portal" replace />
  if (me.isPending) return <FullPageSpinner label={t('common.loading')} />
  if (me.isError) return <p className="p-6 text-sm text-destructive">{t('errors.title')}</p>
  const m = me.data

  if (phone) return <PortalApp m={m} photo={photo} qr={qr} onSignOut={signOut} />

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut />
              {t('portal.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <main className="rise-in mx-auto max-w-5xl space-y-4 px-4 py-6">
        <section className="flex items-center gap-4 rounded-xl border bg-card p-5">
          <MemberPhoto member={m} photo={photo} className="size-24 text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{t('portal.welcome')}</p>
            <h1 className="text-2xl font-semibold">{memberFullName(m)}</h1>
            {m.christianName && <p className="text-sm text-muted-foreground">{m.christianName}</p>}
            <p className="mt-1 font-mono text-sm font-semibold text-primary">{m.memberCode}</p>
          </div>
          {qr && (
            <div className="flex flex-col items-center gap-1 rounded-lg border bg-white p-2">
              <img src={qr} alt={`QR ${m.memberCode}`} className="size-32" />
              <span className="text-[11px] text-neutral-600">{t('portal.showAtCheckIn')}</span>
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <ClassesCard m={m} />
          <DepartmentsCard m={m} />
          <MemberExamsPanel memberId={m.id} load={portalApi.exams} linkExams={false} emptyText={t('portal.noExams')} />
          <MemberAttendancePanel memberId={m.id} load={portalApi.attendance} linkSessions={false} />
          <MemberCoursesPanel memberId={m.id} load={portalApi.courses} linkRuns={false} />
          <PersonalCard m={m} />
          <ContactCard m={m} />
        </div>
      </main>
    </div>
  )
}
