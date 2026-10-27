import { Loader2, RotateCcw, Save, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { Gradebook, ScoreInput } from '../types'
import { ResultBadge } from './course-badges'

const cell = (assessmentId: number, memberId: number) => `${assessmentId}:${memberId}`
const SCORE = /^\d{0,3}(\.\d{0,2})?$/

/**
 * The run's mark sheet: one row per student, one column per assessment.
 * Edits stay local until saved, so a teacher can fill a whole column first.
 */
export function MarksSheet({
  book,
  editable,
  onSave,
}: {
  book: Gradebook
  editable: boolean
  onSave: (scores: ScoreInput[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const { assessments, course } = book.offering
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [search, setSearch] = useState('')

  const saved = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of book.students) for (const [a, v] of Object.entries(s.marks)) map[cell(Number(a), s.member.id)] = v
    return map
  }, [book])
  const max = useMemo(() => new Map(assessments.map((a) => [a.id, a.maxScore])), [assessments])

  const valueOf = (a: number, m: number) => draft[cell(a, m)] ?? (saved[cell(a, m)] !== undefined ? String(saved[cell(a, m)]) : '')
  const invalid = (a: number, m: number) => {
    const v = draft[cell(a, m)]
    return v !== undefined && v !== '' && (Number.isNaN(Number(v)) || Number(v) > (max.get(a) ?? 0))
  }
  const changes = Object.entries(draft).filter(([key, v]) => {
    const before = saved[key]
    return v === '' ? before !== undefined : Number(v) !== before
  })
  const hasInvalid = Object.keys(draft).some((key) => {
    const [a, m] = key.split(':').map(Number) as [number, number]
    return invalid(a, m)
  })
  const searchTerm = search.trim().toLocaleLowerCase()
  const students = book.students.filter((student) => {
    if (!searchTerm) return true
    const member = student.member
    return [member.memberCode, member.firstName, member.fatherName, member.grandfatherName, member.christianName]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(searchTerm)
  })

  const save = async () => {
    setPending(true)
    try {
      await onSave(
        changes.map(([key, v]) => {
          const [assessmentId, memberId] = key.split(':').map(Number) as [number, number]
          return { assessmentId, memberId, score: v === '' ? null : Number(v) }
        }),
      )
      setDraft({})
      toast.success(t('courses.marks.saved', { count: changes.length }))
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-3 sm:p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('courses.marks.search')}
            aria-label={t('courses.marks.search')}
            className="pl-8"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card py-2.5 pr-3 pl-4 font-medium">{t('courses.marks.student')}</th>
              {assessments.map((a) => (
                <th key={a.id} className="px-2 py-2.5 text-center font-medium">
                  <span className="block text-foreground">{a.name}</span>
                  <span className="tabular">/ {a.maxScore}</span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">
                <span className="block text-foreground">{t('courses.marks.total')}</span>
                <span className="tabular">/ {book.offering.totalMax}</span>
              </th>
              <th className="py-2.5 pr-4 pl-2 text-left font-medium">{t('courses.marks.result')}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.member.id} className="border-b last:border-0">
                <td className="sticky left-0 z-10 bg-card py-2 pr-3 pl-4">
                  <div className="flex items-center gap-2.5">
                    <MemberAvatar member={s.member} />
                    <div className="min-w-0">
                      <p className="max-w-32 truncate font-medium sm:max-w-56">{memberFullName(s.member)}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{s.member.memberCode}</span>
                        {!s.inGrade && ` · ${t('courses.marks.left')}`}
                      </p>
                    </div>
                  </div>
                </td>
                {assessments.map((a) => {
                  const key = cell(a.id, s.member.id)
                  const bad = invalid(a.id, s.member.id)
                  return (
                    <td key={a.id} className="px-2 py-2 text-center">
                      {editable ? (
                        <input
                          value={valueOf(a.id, s.member.id)}
                          onChange={(e) => {
                            const v = e.target.value.trim()
                            if (SCORE.test(v)) setDraft((d) => ({ ...d, [key]: v }))
                          }}
                          inputMode="decimal"
                          aria-label={t('courses.marks.cellLabel', { name: memberFullName(s.member), assessment: a.name })}
                          aria-invalid={bad || undefined}
                          className={cn(
                            'tabular h-8 w-16 rounded-md border bg-background px-2 text-right outline-none transition-colors',
                            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                            key in draft && !bad && 'border-primary/50 bg-primary/5',
                            bad && 'border-destructive bg-destructive/5',
                          )}
                        />
                      ) : (
                        <span className="tabular">{valueOf(a.id, s.member.id) || '—'}</span>
                      )}
                    </td>
                  )
                })}
                <td className="tabular px-3 py-2 text-right font-semibold">{s.total ?? '—'}</td>
                <td className="py-2 pr-4 pl-2">
                  <ResultBadge result={s.result} />
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={assessments.length + 3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('courses.marks.noMatch')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {hasInvalid
              ? t('courses.marks.fixInvalid')
              : changes.length > 0
                ? t('courses.marks.unsaved', { count: changes.length })
                : t('courses.marks.passMark', { mark: course.passMark })}
          </p>
          <div className="flex gap-2">
            {Object.keys(draft).length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setDraft({})} disabled={pending}>
                <RotateCcw />
                {t('courses.marks.discard')}
              </Button>
            )}
            <Button size="sm" onClick={() => void save()} disabled={pending || hasInvalid || changes.length === 0}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('courses.marks.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
