import { GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useLocalizedName } from '@/features/classes/use-localized'
import { formatDate } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { useMemberCourseResults } from '../api'
import { ResultBadge } from './course-badges'

/** A member's course marks, newest run first (member detail page). */
export function MemberCoursesPanel({ memberId }: { memberId: number }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { can } = useAuth()
  const results = useMemberCourseResults(memberId)
  // Hidden for members who never took a course.
  if (results.isPending) return <Skeleton className="h-32 rounded-xl lg:col-span-2" />
  if (results.isError || results.data.length === 0) return null

  return (
    <section className="rounded-xl border bg-card p-5 lg:col-span-2">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
        <GraduationCap className="size-4 text-muted-foreground" />
        {t('courses.member.title')}
      </h2>
      <ul className="divide-y">
        {results.data.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {can(PERMISSIONS.COURSES_READ) ? (
                <Link to={`/courses/runs/${r.id}`} className="font-medium hover:underline">
                  {name(r.course)}
                </Link>
              ) : (
                <p className="font-medium">{name(r.course)}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {name(r.classGrade)} · {formatDate(r.startDate)} – {formatDate(r.endDate)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.marks.map((m) => `${m.name} ${m.score ?? '—'}/${m.maxScore}`).join(' · ')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="tabular text-sm font-semibold">
                {r.total ?? '—'} <span className="font-normal text-muted-foreground">/ {r.totalMax}</span>
              </span>
              <ResultBadge result={r.result} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
