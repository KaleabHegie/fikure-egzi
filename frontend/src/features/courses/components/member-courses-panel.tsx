import { GraduationCap, Presentation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { useMemberCourses } from '../api'
import type { MemberCourses, Teacher } from '../types'
import { PhaseBadge, ResultBadge } from './course-badges'

const teacherNames = (teachers: Teacher[]) =>
  teachers.map((x) => (x.member ? memberFullName(x.member) : x.fullName)).join('، ')

/**
 * A member's courses: the ones they take (current runs of their class, and
 * past results) and, for teachers, the runs they teach now. Used on the staff
 * member page and in the member portal (`load` + no links). Runs link to
 * their page only for staff who can open courses.
 */
export function MemberCoursesPanel({
  memberId,
  load,
  linkRuns = true,
}: {
  memberId: number
  load?: () => Promise<MemberCourses>
  linkRuns?: boolean
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { can } = useAuth()
  const courses = useMemberCourses(memberId, load)
  const links = linkRuns && can(PERMISSIONS.COURSES_READ)
  if (courses.isPending) return <Skeleton className="h-32 rounded-xl lg:col-span-2" />
  // Hidden for members with nothing course-related.
  if (courses.isError || (courses.data.taking.length === 0 && courses.data.teaching.length === 0)) return null
  const { taking, teaching } = courses.data

  const title = (run: { id: number; course: { nameEn: string; nameAm: string } }) =>
    links ? (
      <Link to={`/courses/runs/${run.id}`} className="font-medium hover:underline">
        {name(run.course)}
      </Link>
    ) : (
      <p className="font-medium">{name(run.course)}</p>
    )

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 lg:col-span-2">
      {teaching.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Presentation className="size-4 text-muted-foreground" />
            {t('courses.member.teaching')}
          </h2>
          <ul className="divide-y">
            {teaching.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {title(r)}
                  <p className="text-xs text-muted-foreground">
                    {name(r.classGrade.classType)} · {name(r.classGrade)} · {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="tabular text-muted-foreground">{t('courses.member.students', { count: r.students })}</span>
                  <PhaseBadge phase={r.phase} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {taking.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <GraduationCap className="size-4 text-muted-foreground" />
            {t('courses.member.title')}
          </h2>
          <ul className="divide-y">
            {taking.map((r) => {
              const anyMark = r.marks.some((m) => m.score !== null)
              return (
                <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {title(r)}
                      {r.phase !== 'finished' && <PhaseBadge phase={r.phase} />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {name(r.classGrade)} · {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </p>
                    {r.teachers.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('courses.runs.teachers')}: {teacherNames(r.teachers)}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.marks.length === 0
                        ? t('courses.member.noAssessments')
                        : r.marks.map((m) => `${m.name} ${m.score ?? '—'}/${m.maxScore}`).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {anyMark ? (
                      <>
                        <span className="tabular text-sm font-semibold">
                          {r.total ?? '—'} <span className="font-normal text-muted-foreground">/ {r.totalMax}</span>
                        </span>
                        <ResultBadge result={r.result} />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('courses.member.noMarks')}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
