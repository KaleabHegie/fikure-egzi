import { Building2, BookOpen, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGradeLabel, useLocalizedName } from '@/features/classes/use-localized'
import { RoleBadge } from '@/features/departments/components/role-badge'
import { useMemberLabels } from '@/features/members/labels'
import { memberFullName } from '@/features/members/utils'
import { ageFrom, formatDate } from '@/lib/format'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import type { PortalMember } from '../api'

/** The pieces of a member's own page, shared by the desktop layout and the phone app layout. */

export function Card({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 sm:p-5', className)}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold sm:mb-4">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Detail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0 break-words', wide && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  )
}

export function MemberPhoto({ member, photo, className }: { member: PortalMember; photo: string | null; className?: string }) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground',
        className,
      )}
    >
      {photo ? (
        <img src={photo} alt={memberFullName(member)} className="size-full object-cover" />
      ) : (
        `${member.firstName[0]}${member.fatherName[0]}`
      )}
    </div>
  )
}

export function ClassesCard({ m }: { m: PortalMember }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const gradeLabel = useGradeLabel()
  return (
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
  )
}

export function DepartmentsCard({ m }: { m: PortalMember }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const currentGroup = m.serviceGroups.find((g) => g.term.isCurrent)
  return (
    <Card title={t('members.sections.departments.title')} icon={Building2}>
      {m.departments.length === 0 && !currentGroup ? (
        <p className="text-sm text-muted-foreground">{t('portal.noDepartments')}</p>
      ) : (
        <ul className="space-y-2">
          {m.departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
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
  )
}

export function PersonalCard({ m }: { m: PortalMember }) {
  const { t } = useTranslation()
  const labels = useMemberLabels()
  const age = ageFrom(m.dateOfBirth)
  return (
    <Card title={t('members.sections.personal.title')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 sm:gap-y-4">
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
  )
}

export function ContactCard({ m }: { m: PortalMember }) {
  const { t } = useTranslation()
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
    <Card title={t('members.sections.contact.title')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 sm:gap-y-4">
        <Detail label={t('members.fields.phone')}>{formatPhone(m.phone)}</Detail>
        <Detail label={t('members.fields.alternatePhone')}>{formatPhone(m.alternatePhone)}</Detail>
        <Detail label={t('members.fields.email')} wide>
          {m.email}
        </Detail>
        <Detail label={t('members.fields.address')} wide>
          {address}
        </Detail>
        <Detail label={t('members.sections.emergency.title')}>
          {m.emergencyContactName}
          {m.emergencyContactRelation && ` (${m.emergencyContactRelation})`}
        </Detail>
        <Detail label={`${t('members.sections.emergency.title')} · ${t('members.fields.emergencyPhone')}`}>
          {formatPhone(m.emergencyContactPhone)}
        </Detail>
      </dl>
    </Card>
  )
}
