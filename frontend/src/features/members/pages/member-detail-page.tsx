import { ChevronLeft, Download, Heart, IdCard, Pencil, Phone, Printer, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EthiopianCross } from '@/components/brand/tibeb'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/features/auth/guards'
import { MemberAttendancePanel } from '@/features/attendance/components/member-attendance-panel'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { MemberCoursesPanel } from '@/features/courses/components/member-courses-panel'
import { MemberDepartmentsPanel } from '@/features/departments/components/member-departments-panel'
import { MemberServiceGroups } from '@/features/service-groups/components/member-service-groups'
import { getErrorMessage } from '@/lib/api/errors'
import { ageFrom, formatDate, formatDateTime } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { formatPhone } from '@/lib/phone'
import { memberQrPayload, useQrDataUrl } from '@/lib/qr'
import { cn } from '@/lib/utils'
import { useDeleteMember, useMember } from '../api'
import { MemberAvatar } from '../components/member-avatar'
import { StatusBadge } from '../components/member-badges'
import { MemberHistory } from '../components/member-history'
import { useMemberLabels } from '../labels'
import type { Member } from '../types'
import { memberFullName } from '../utils'

type Row = { label: string; value: React.ReactNode }

/** A register-style list: label on the left, value on the right, one fact per line. */
function Facts({ title, icon: Icon, rows, className }: { title: string; icon: React.ElementType; rows: Row[]; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-5', className)}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-brand" aria-hidden />
        {title}
      </h2>
      <dl>
        {rows.map(({ label, value }) => {
          const empty = value === null || value === undefined || value === '' || value === false
          return (
            <div key={label} className="grid grid-cols-[minmax(6.5rem,38%)_1fr] gap-4 border-b border-dashed py-2.5 last:border-0">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className={cn('min-w-0 text-sm break-words', empty ? 'text-muted-foreground/60' : 'font-medium')}>
                {empty ? '—' : value}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/** The member's QR (their ID), with download and print. */
function QrBlock({ member }: { member: Member }) {
  const { t } = useTranslation()
  const { data: qr } = useQrDataUrl(memberQrPayload(member.memberCode))
  const download = () => {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `${member.memberCode}-qr.png`
    a.click()
  }
  return (
    <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-2">
      <div className="rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-border">
        {qr ? (
          <img src={qr} alt={t('members.qr.alt', { code: member.memberCode })} className="size-24 sm:size-28" />
        ) : (
          <Skeleton className="size-24 sm:size-28" />
        )}
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={download} disabled={!qr} aria-label={t('members.qr.download')} title={t('members.qr.download')}>
          <Download />
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label={t('members.qr.printCard')} title={t('members.qr.printCard')}>
          <Link to={`/members/cards?id=${member.id}`} target="_blank" rel="noopener">
            <Printer />
          </Link>
        </Button>
      </div>
    </div>
  )
}

/** The membership card at the top of a member's page. */
function MemberCard({ member: m }: { member: Member }) {
  const { t } = useTranslation()
  const localName = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const age = ageFrom(m.dateOfBirth)
  return (
    <section
      className="overflow-hidden rounded-2xl border border-t-4 border-t-brand bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
      aria-labelledby="member-name"
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-7 sm:p-7">
        <MemberAvatar
          member={m}
          size="lg"
          className="size-24 text-2xl ring-[3px] ring-gold ring-offset-[3px] ring-offset-card sm:size-28 sm:text-3xl"
        />
        <div className="min-w-0 space-y-2.5">
          <div>
            <h1 id="member-name" className="font-record text-3xl leading-tight font-semibold text-balance sm:text-4xl">
              {memberFullName(m)}
            </h1>
            {m.christianName && (
              <p className="mt-1 flex items-center gap-1.5 text-gilt-ink">
                <EthiopianCross className="size-4 shrink-0" />
                <span className="font-record text-lg font-medium">{m.christianName}</span>
              </p>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <StatusBadge status={m.status} />
            <span className="tabular font-mono text-xs font-semibold tracking-wider text-foreground">{m.memberCode}</span>
            {age !== null && <span>{t('common.years', { count: age })}</span>}
            <span>{t('members.detail.memberSince', { date: formatDate(m.joinedAt) })}</span>
          </p>
          {m.classes.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('members.sections.classes.title')}>
              {m.classes.map((c) => (
                <li key={c.classType.id}>
                  <Link
                    to={`/members?classGradeId=${c.classGrade.id}`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-3 text-xs transition-colors hover:border-brand/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="text-muted-foreground">{localName(c.classType)}</span>
                    <span className="font-semibold">{gradeLabel(c.classGrade)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <QrBlock member={m} />
      </div>
    </section>
  )
}

export function MemberDetailPage() {
  const { t } = useTranslation()
  const labels = useMemberLabels()
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data: m, isPending, isError, error, refetch } = useMember(id)
  const deleteMember = useDeleteMember()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  const name = memberFullName(m)
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
  const tel = (phone: string | null) =>
    phone ? (
      <a href={`tel:${phone}`} className="tabular hover:text-brand hover:underline">
        {formatPhone(phone)}
      </a>
    ) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/members" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {t('nav.members')}
        </Link>
        <div className="flex gap-2">
          <Can permission={PERMISSIONS.MEMBERS_DELETE}>
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              {t('common.remove')}
            </Button>
          </Can>
          <Can permission={PERMISSIONS.MEMBERS_UPDATE}>
            <Button asChild>
              <Link to={`/members/${m.id}/edit`}>
                <Pencil />
                {t('common.edit')}
              </Link>
            </Button>
          </Can>
        </div>
      </div>

      <MemberCard member={m} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid content-start gap-4 xl:col-span-2">
          <Facts
            title={t('members.sections.personal.title')}
            icon={UserRound}
            rows={[
              { label: t('members.fields.gender'), value: labels.gender(m.gender) },
              {
                label: t('members.fields.dateOfBirth'),
                value: m.dateOfBirth && `${formatDate(m.dateOfBirth)}${age !== null ? ` · ${t('common.years', { count: age })}` : ''}`,
              },
              { label: t('members.fields.placeOfBirth'), value: m.placeOfBirth },
              { label: t('members.fields.maritalStatus'), value: m.maritalStatus && labels.maritalStatus(m.maritalStatus) },
              { label: t('members.fields.education'), value: m.educationLevel && labels.education(m.educationLevel) },
              { label: t('members.fields.occupation'), value: m.occupation },
              { label: t('members.fields.spiritualFather'), value: m.spiritualFatherName },
            ]}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Facts
              title={t('members.sections.contact.title')}
              icon={Phone}
              rows={[
                { label: t('members.fields.phone'), value: tel(m.phone) },
                { label: t('members.fields.alternatePhone'), value: tel(m.alternatePhone) },
                {
                  label: t('members.fields.email'),
                  value: m.email && (
                    <a href={`mailto:${m.email}`} className="hover:text-brand hover:underline">
                      {m.email}
                    </a>
                  ),
                },
                { label: t('members.fields.address'), value: address },
              ]}
            />
            <Facts
              title={t('members.sections.emergency.title')}
              icon={Heart}
              rows={[
                { label: t('members.fields.emergencyName'), value: m.emergencyContactName },
                { label: t('members.fields.emergencyRelation'), value: m.emergencyContactRelation },
                { label: t('members.fields.emergencyPhone'), value: tel(m.emergencyContactPhone) },
              ]}
            />
          </div>
        </div>

        <aside className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1" aria-label={t('members.detail.service')}>
          <MemberDepartmentsPanel member={m} />
          <Can permission={PERMISSIONS.CLASSES_READ}>
            <MemberServiceGroups memberId={m.id} />
          </Can>
          {m.classes.length === 0 && (
            <Facts title={t('members.sections.classes.title')} icon={IdCard} rows={[{ label: t('members.sections.classes.title'), value: null }]} />
          )}
        </aside>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Can permission={PERMISSIONS.ATTENDANCE_READ}>
          <MemberAttendancePanel memberId={m.id} />
        </Can>
        <MemberCoursesPanel memberId={m.id} />
        <MemberHistory memberId={m.id} />
        {m.notes && (
          <section className="rounded-xl border bg-card p-5 lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold">{t('members.sections.notes.title')}</h2>
            <p className="text-sm whitespace-pre-line">{m.notes}</p>
          </section>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {m.createdBy
          ? t('members.detail.registeredBy', { date: formatDateTime(m.createdAt), name: m.createdBy.fullName })
          : t('members.detail.registered', { date: formatDateTime(m.createdAt) })}
        {' · '}
        {m.updatedBy
          ? t('members.detail.updatedBy', { date: formatDateTime(m.updatedAt), name: m.updatedBy.fullName })
          : t('members.detail.updated', { date: formatDateTime(m.updatedAt) })}
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('members.delete.title')}
        description={t('members.delete.body', { name, code: m.memberCode })}
        confirmLabel={t('members.delete.confirm')}
        destructive
        pending={deleteMember.isPending}
        onConfirm={() =>
          deleteMember.mutate(m.id, {
            onSuccess: () => {
              toast.success(t('members.delete.done', { name }))
              navigate('/members', { replace: true })
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </div>
  )
}
