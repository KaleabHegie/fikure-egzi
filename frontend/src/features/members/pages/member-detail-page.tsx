import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/features/auth/guards'
import { getErrorMessage } from '@/lib/api/errors'
import { ageFrom, formatDate, formatDateTime } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { formatPhone } from '@/lib/phone'
import { useDeleteMember, useMember } from '../api'
import { StatusBadge } from '../components/member-badges'
import { MemberAvatar } from '../components/member-avatar'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { MemberDepartmentsPanel } from '@/features/departments/components/member-departments-panel'
import { MemberAttendancePanel } from '@/features/attendance/components/member-attendance-panel'
import { MemberCoursesPanel } from '@/features/courses/components/member-courses-panel'
import { MemberServiceGroups } from '@/features/service-groups/components/member-service-groups'
import { MemberHistory } from '../components/member-history'
import { MemberQrCard } from '../components/member-qr-card'
import { useMemberLabels } from '../labels'
import { memberFullName } from '../utils'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={empty ? 'text-muted-foreground/70' : 'text-sm'}>{empty ? '—' : children}</dd>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-medium">{title}</h2>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

export function MemberDetailPage() {
  const { t } = useTranslation()
  const labels = useMemberLabels()
  const localName = useLocalizedName()
  const gradeLabel = useGradeLabel()
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data: m, isPending, isError, error, refetch } = useMember(id)
  const deleteMember = useDeleteMember()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-96" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
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

  return (
    <>
      <PageHeader
        back={{ to: '/members', label: t('nav.members') }}
        title={
          <span className="flex items-center gap-4">
            <MemberAvatar member={m} size="lg" />
            <span>{name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2 sm:pl-24">
            <span className="tabular font-mono text-xs">{m.memberCode}</span>
            <StatusBadge status={m.status} />
          </span>
        }
        actions={
          <>
            <Can permission={PERMISSIONS.MEMBERS_DELETE}>
              <Button variant="outline" size="lg" onClick={() => setConfirmOpen(true)}>
                <Trash2 />
                {t('common.remove')}
              </Button>
            </Can>
            <Can permission={PERMISSIONS.MEMBERS_UPDATE}>
              <Button asChild size="lg">
                <Link to={`/members/${m.id}/edit`}>
                  <Pencil />
                  {t('common.edit')}
                </Link>
              </Button>
            </Can>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('members.sections.personal.title')}>
          <Detail label={t('members.fields.christianName')}>{m.christianName}</Detail>
          <Detail label={t('members.fields.gender')}>{labels.gender(m.gender)}</Detail>
          <Detail label={t('members.fields.dateOfBirth')}>
            {m.dateOfBirth &&
              `${formatDate(m.dateOfBirth)}${age !== null ? ` · ${t('common.years', { count: age })}` : ''}`}
          </Detail>
          <Detail label={t('members.fields.placeOfBirth')}>{m.placeOfBirth}</Detail>
          <Detail label={t('members.fields.maritalStatus')}>
            {m.maritalStatus && labels.maritalStatus(m.maritalStatus)}
          </Detail>
          <Detail label={t('members.fields.education')}>{m.educationLevel && labels.education(m.educationLevel)}</Detail>
          <Detail label={t('members.fields.occupation')}>{m.occupation}</Detail>
        </Panel>

        <Panel title={t('members.sections.membership.title')}>
          <Detail label={t('members.fields.joinedAt')}>{formatDate(m.joinedAt)}</Detail>
          <Detail label={t('members.fields.spiritualFather')}>{m.spiritualFatherName}</Detail>
        </Panel>

        <Panel title={t('members.sections.classes.title')}>
          {m.classes.length === 0 ? (
            <Detail label={t('members.sections.classes.title')}>{null}</Detail>
          ) : (
            m.classes.map((c) => (
              <Detail key={c.classType.id} label={localName(c.classType)}>
                <Link to={`/members?classGradeId=${c.classGrade.id}`} className="hover:underline">
                  {gradeLabel(c.classGrade)}
                </Link>
              </Detail>
            ))
          )}
        </Panel>

        <MemberDepartmentsPanel member={m} />

        <Can permission={PERMISSIONS.CLASSES_READ}>
          <MemberServiceGroups memberId={m.id} />
        </Can>

        <Panel title={t('members.sections.contact.title')}>
          <Detail label={t('members.fields.phone')}>{formatPhone(m.phone)}</Detail>
          <Detail label={t('members.fields.alternatePhone')}>{formatPhone(m.alternatePhone)}</Detail>
          <Detail label={t('members.fields.email')}>{m.email}</Detail>
          <Detail label={t('members.fields.address')}>{address}</Detail>
        </Panel>

        <Panel title={t('members.sections.emergency.title')}>
          <Detail label={t('members.fields.emergencyName')}>{m.emergencyContactName}</Detail>
          <Detail label={t('members.fields.emergencyRelation')}>{m.emergencyContactRelation}</Detail>
          <Detail label={t('members.fields.emergencyPhone')}>{formatPhone(m.emergencyContactPhone)}</Detail>
        </Panel>

        <MemberQrCard member={m} />

        <Can permission={PERMISSIONS.ATTENDANCE_READ}>
          <MemberAttendancePanel memberId={m.id} />
        </Can>

        <MemberCoursesPanel memberId={m.id} />

        <MemberHistory memberId={m.id} />

        {m.notes && (
          <section className="rounded-xl border bg-card p-5 lg:col-span-2">
            <h2 className="mb-2 text-sm font-medium">{t('members.sections.notes.title')}</h2>
            <p className="text-sm whitespace-pre-line">{m.notes}</p>
          </section>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
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
    </>
  )
}
