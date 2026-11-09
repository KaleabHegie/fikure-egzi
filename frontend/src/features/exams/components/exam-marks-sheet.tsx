import { Loader2, RotateCcw, Save, Search, UserMinus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { ExamCandidateRow, ExamMarkInput, ExamMember, ExamSheet } from '../types'
import { ExamResultBadge } from './exam-result-badge'

const cell = (partId: number, memberId: number) => `${partId}:${memberId}`
const SCORE = /^\d{0,3}(\.\d{0,2})?$/

/**
 * The exam's mark sheet: one row per candidate, one column per part, each part
 * marked out of its weight. Edits stay local until saved, so a whole column
 * can be filled first.
 */
export function ExamMarksSheet({
  sheet,
  editable,
  onSave,
  onRemove,
}: {
  sheet: ExamSheet
  editable: boolean
  onSave: (marks: ExamMarkInput[]) => Promise<void>
  onRemove: (member: ExamMember) => void
}) {
  const { t } = useTranslation()
  const { parts, passMark, totalWeight } = sheet.exam
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [search, setSearch] = useState('')

  const saved = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of sheet.candidates) for (const [p, v] of Object.entries(c.marks)) map[cell(Number(p), c.member.id)] = v
    return map
  }, [sheet])
  const weight = useMemo(() => new Map(parts.map((p) => [p.id, p.weight])), [parts])

  const valueOf = (p: number, m: number) => draft[cell(p, m)] ?? (saved[cell(p, m)] !== undefined ? String(saved[cell(p, m)]) : '')
  const invalid = (p: number, m: number) => {
    const v = draft[cell(p, m)]
    return v !== undefined && v !== '' && (Number.isNaN(Number(v)) || Number(v) > (weight.get(p) ?? 0))
  }
  const changes = Object.entries(draft).filter(([key, v]) => {
    const before = saved[key]
    return v === '' ? before !== undefined : Number(v) !== before
  })
  const hasInvalid = Object.keys(draft).some((key) => {
    const [p, m] = key.split(':').map(Number) as [number, number]
    return invalid(p, m)
  })
  const term = search.trim().toLocaleLowerCase()
  const rows = sheet.candidates.filter((c: ExamCandidateRow) => {
    if (!term) return true
    const m = c.member
    return [m.memberCode, m.firstName, m.fatherName, m.grandfatherName, m.christianName]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(term)
  })

  const save = async () => {
    setPending(true)
    try {
      await onSave(
        changes.map(([key, v]) => {
          const [partId, memberId] = key.split(':').map(Number) as [number, number]
          return { partId, memberId, score: v === '' ? null : Number(v) }
        }),
      )
      setDraft({})
      toast.success(t('exams.marks.saved', { count: changes.length }))
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('exams.marks.search')}
            aria-label={t('exams.marks.search')}
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground">{t('exams.marks.showing', { shown: rows.length, total: sheet.candidates.length })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card py-2.5 pr-3 pl-4 font-medium">{t('exams.marks.candidate')}</th>
              {parts.map((p) => (
                <th key={p.id} className="px-2 py-2.5 text-center font-medium">
                  <span className="block text-foreground">{p.name}</span>
                  <span className="tabular">/ {p.weight}</span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">
                <span className="block text-foreground">{t('exams.marks.total')}</span>
                <span className="tabular">/ {totalWeight}</span>
              </th>
              <th className="py-2.5 pr-2 pl-2 text-left font-medium">{t('exams.marks.result')}</th>
              {editable && <th className="w-10 pr-3" aria-label={t('exams.candidates.remove')} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.member.id} className="border-b last:border-0">
                <td className="sticky left-0 z-10 bg-card py-2 pr-3 pl-4">
                  <div className="flex items-center gap-2.5">
                    <MemberAvatar member={c.member} />
                    <div className="min-w-0">
                      <p className="max-w-32 truncate font-medium sm:max-w-56">{memberFullName(c.member)}</p>
                      <p className="font-mono text-xs text-muted-foreground">{c.member.memberCode}</p>
                    </div>
                  </div>
                </td>
                {parts.map((p) => {
                  const key = cell(p.id, c.member.id)
                  const bad = invalid(p.id, c.member.id)
                  return (
                    <td key={p.id} className="px-2 py-2 text-center">
                      {editable ? (
                        <input
                          value={valueOf(p.id, c.member.id)}
                          onChange={(e) => {
                            const v = e.target.value.trim()
                            if (SCORE.test(v)) setDraft((d) => ({ ...d, [key]: v }))
                          }}
                          inputMode="decimal"
                          aria-label={t('exams.marks.cellLabel', { name: memberFullName(c.member), part: p.name })}
                          aria-invalid={bad || undefined}
                          className={cn(
                            'tabular h-8 w-16 rounded-md border bg-background px-2 text-right outline-none transition-colors',
                            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                            key in draft && !bad && 'border-primary/50 bg-primary/5',
                            bad && 'border-destructive bg-destructive/5',
                          )}
                        />
                      ) : (
                        <span className="tabular">{valueOf(p.id, c.member.id) || '—'}</span>
                      )}
                    </td>
                  )
                })}
                <td className="tabular px-3 py-2 text-right font-semibold">{c.total ?? '—'}</td>
                <td className="py-2 pr-2 pl-2">
                  <ExamResultBadge result={c.result} />
                </td>
                {editable && (
                  <td className="py-2 pr-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(c.member)}
                      aria-label={t('exams.candidates.removeName', { name: memberFullName(c.member) })}
                      title={t('exams.candidates.remove')}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={parts.length + 4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('exams.marks.noMatch')}
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
              ? t('exams.marks.fixInvalid')
              : changes.length > 0
                ? t('exams.marks.unsaved', { count: changes.length })
                : t('exams.marks.passMark', { mark: passMark })}
          </p>
          <div className="flex gap-2">
            {Object.keys(draft).length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setDraft({})} disabled={pending}>
                <RotateCcw />
                {t('exams.marks.discard')}
              </Button>
            )}
            <Button size="sm" onClick={() => void save()} disabled={pending || hasInvalid || changes.length === 0}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('exams.marks.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
