import { useQueryClient } from '@tanstack/react-query'
import { Building2, BookOpen, LogOut, UsersRound } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { FullPageSpinner } from '@/components/common/full-page-spinner'
import { BrandMark } from '@/components/layout/brand-mark'
import { LanguageSwitch, ThemeToggle } from '@/components/layout/preferences'
import { Button } from '@/components/ui/button'
import { MemberAttendancePanel } from '@/features/attendance/components/member-attendance-panel'
import { MemberCoursesPanel } from '@/features/courses/components/member-courses-panel'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { RoleBadge } from '@/features/departments/components/role-badge'
import { useMemberLabels } from '@/features/members/labels'
import { memberFullName } from '@/features/members/utils'
import { toApiError } from '@/lib/api/errors'
import { ageFrom, formatDate } from '@/lib/format'
import { formatPhone } from '@/lib/phone'
import { memberQrPayload, useQrDataUrl } from '@/lib/qr'
import { portalApi, portalSession, usePortalMember, usePortalPhoto } from '../api'

function Card({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  )
}

/** A member's own page: profile, classes and departments, attendance and their QR code. */
export function PortalHomePage() {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const labels = useMemberLabels()
  const navigate = useNavigate()
  const qc = useQueryClient()
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
  const age = ageFrom(m.dateOfBirth)
  const address = [
    m.houseNumber && t('members.detail.house', { value: m.houseNumber }),
    m.kebele && t('members.detail.kebele', { value: m.kebele }),
    m.woreda && t('members.detail.woreda', { value: m.woreda }),
    m.subCity,
    m.city,
  ]
    .filter(Boolean)
    .join(', ')
  const currentGroup = m.serviceGroups.find((g) => g.term.isCurrent)

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut />
              <span className="hidden sm:inline">{t('portal.signOut')}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <section className="flex flex-col items-center gap-4 rounded-xl border bg-card p-5 text-center sm:flex-row sm:text-left">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-2xl font-semibold text-accent-foreground">
            {photo ? <img src={photo} alt={memberFullName(m)} className="size-full object-cover" /> : `${m.firstName[0]}${m.fatherName[0]}`}
          </div>
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
          <Card title={t('members.sections.personal.title')}>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label={t('members.fields.gender')}>{labels.gender(m.gender)}</Detail>
              <Detail label={t('members.fields.dateOfBirth')}>
                {m.dateOfBirth && `${formatDate(m.dateOfBirth)}${age !== null ? ` · ${t('common.years', { count: age })}` : ''}`}
              </Detail>
              <Detail label={t('members.fields.joinedAt')}>{formatDate(m.joinedAt)}</Detail>
              <Detail label={t('members.table.status')}>{labels.status(m.status)}</Detail>
              <Detail label={t('members.fields.spiritualFather')}>{m.spiritualFatherName}</Detail>
              <Detail label={t('members.fields.occupation')}>{m.occupation}</Detail>
            </dl>
          </Card>
          <Card title={t('members.sections.contact.title')}>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label={t('members.fields.phone')}>{formatPhone(m.phone)}</Detail>
              <Detail label={t('members.fields.alternatePhone')}>{formatPhone(m.alternatePhone)}</Detail>
              <Detail label={t('members.fields.email')}>{m.email}</Detail>
              <Detail label={t('members.fields.address')}>{address}</Detail>
              <Detail label={t('members.sections.emergency.title')}>
                {m.emergencyContactName}
                {m.emergencyContactRelation && ` (${m.emergencyContactRelation})`}
              </Detail>
              <Detail label={`${t('members.sections.emergency.title')} · ${t('members.fields.emergencyPhone')}`}>{formatPhone(m.emergencyContactPhone)}</Detail>
            </dl>
          </Card>
          <Card title={t('members.sections.classes.title')} icon={BookOpen}>
            {m.classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('portal.noClasses')}</p>
            ) : (
              <ul className="space-y-2">
                {m.classes.map((c) => (
                  <li key={c.classType.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{name(c.classType)}</span>
                    <span className="font-medium">{gradeLabel(c.classGrade)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t('members.sections.departments.title')} icon={Building2}>
            {m.departments.length === 0 && !currentGroup ? (
              <p className="text-sm text-muted-foreground">{t('portal.noDepartments')}</p>
            ) : (
              <ul className="space-y-2">
                {m.departments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">{name(d.department)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('departments.roster.joinedAt')}: {formatDate(d.joinedAt)}
                      </span>
                    </span>
                    <RoleBadge role={d.role} />
                  </li>
                ))}
                {currentGroup && (
                  <li className="flex items-center justify-between gap-3 border-t pt-2 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <UsersRound className="size-4" />
                      {t('serviceGroups.member.title')}
                    </span>
                    <span className="font-medium">{name(currentGroup.group)}</span>
                  </li>
                )}
              </ul>
            )}
          </Card>
          <MemberCoursesPanel memberId={m.id} load={portalApi.courses} linkRuns={false} />
          <MemberAttendancePanel memberId={m.id} load={portalApi.attendance} linkSessions={false} />
        </div>
      </main>
    </div>
  )
}
