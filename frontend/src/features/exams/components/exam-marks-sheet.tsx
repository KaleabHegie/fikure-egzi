import { CopyCheck, Loader2, RotateCcw, Save, Search, UserMinus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { matchesFilter, type ExamFilter } from '../exam-filter'
import type { ExamCandidateRow, ExamGroup, ExamMarkInput, ExamMember, ExamSheet } from '../types'
import { ExamResultBadge } from './exam-result-badge'

const cell = (partId: number, memberId: number) => `${partId}:${memberId}`
const SCORE = /^\d{0,3}(\.\d{0,2})?$/

/**
 * The exam's mark sheet: one row per candidate, one column per part, each part
 * marked out of its weight. Edits stay local until saved, so a whole column
 * can be filled first. Candidates examined as a group can be selected (they move
 * to the top, and stay shown while searching for the next one) and given the same
 * marks at once; anyone's mark can still be changed on its own after. Saved, they
 * are kept as a group "marked together", which can be looked at again later.
 */
export function ExamMarksSheet({
  sheet,
  editable,
  onSave,
  onRemove,
  filter = 'all',
  group = null,
  onGroup,
}: {
  sheet: ExamSheet
  /** Narrows the rows, e.g. only candidates still missing marks (chosen from the figures). */
  filter?: ExamFilter
  /** Only the candidates of this group (marked together). */
  group?: number | null
  onGroup: (groupId: number | null) => void
  editable: boolean
  onSave: (marks: ExamMarkInput[], groups: { memberIds: number[] }[]) => Promise<void>
  onRemove: (member: ExamMember) => void
}) {
  const { t } = useTranslation()
  const { parts, passMark, totalWeight } = sheet.exam
  // Phones get one card per candidate instead of a table that scrolls sideways.
  const phone = useMediaQuery('(max-width: 639px)')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [groupMarks, setGroupMarks] = useState<Record<number, string>>({})
  /** Groups given the same marks since the last save; saved with the marks. */
  const [newGroups, setNewGroups] = useState<number[][]>([])

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
  const groupById = useMemo(() => new Map(sheet.groups.map((g) => [g.id, g])), [sheet.groups])
  const shownGroup = group === null ? undefined : groupById.get(group)
  const term = search.trim().toLocaleLowerCase()
  const matches = (c: ExamCandidateRow) => {
    if (!matchesFilter(c, parts, filter)) return false
    if (shownGroup && c.groupId !== shownGroup.id) return false
    if (!term) return true
    const m = c.member
    return [m.memberCode, m.firstName, m.fatherName, m.grandfatherName, m.christianName]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(term)
  }
  // The selected come first and stay shown while searching for the next one to add.
  const rows = [
    ...sheet.candidates.filter((c) => selected.has(c.member.id)),
    ...sheet.candidates.filter((c) => !selected.has(c.member.id) && matches(c)),
  ]

  const shownIds = rows.map((c) => c.member.id)
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id))
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleShown = () =>
    setSelected((s) => {
      const next = new Set(s)
      for (const id of shownIds) {
        if (allShown) next.delete(id)
        else next.add(id)
      }
      return next
    })
  const groupBad = (p: number) => {
    const v = groupMarks[p]
    return v !== undefined && v !== '' && Number(v) > (weight.get(p) ?? 0)
  }
  const groupFilled = parts.filter((p) => (groupMarks[p.id] ?? '') !== '')
  const canApply = selected.size > 0 && groupFilled.length > 0 && !parts.some((p) => groupBad(p.id))
  const clearSelection = () => {
    setSelected(new Set())
    setGroupMarks({})
  }
  /** Fills the group's marks in for everyone selected; saving stays a separate step. */
  const applyGroup = () => {
    if (selected.size > 1) setNewGroups((g) => [...g, [...selected]])
    setDraft((d) => {
      const next = { ...d }
      for (const memberId of selected) for (const p of groupFilled) next[cell(p.id, memberId)] = groupMarks[p.id]!
      return next
    })
    toast.success(t('exams.marks.group.applied', { count: selected.size }))
    clearSelection()
  }

  const candidateIds = new Set(sheet.candidates.map((c) => c.member.id))
  // Those still ticked when saving were marked together too, even with marks typed one by one.
  const groupsToSave = [...newGroups, ...(selected.size > 1 ? [[...selected]] : [])]
    .map((ids) => ids.filter((id) => candidateIds.has(id)))
    .filter((ids) => ids.length > 1)
    .map((memberIds) => ({ memberIds }))
  const discard = () => {
    setDraft({})
    setNewGroups([])
  }

  const save = async () => {
    setPending(true)
    try {
      await onSave(
        changes.map(([key, v]) => {
          const [partId, memberId] = key.split(':').map(Number) as [number, number]
          return { partId, memberId, score: v === '' ? null : Number(v) }
        }),
        groupsToSave,
      )
      discard()
      clearSelection()
      toast.success(t('exams.marks.saved', { count: changes.length }))
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  const scoreInput = (c: ExamCandidateRow, p: (typeof parts)[number], className: string) => {
    const key = cell(p.id, c.member.id)
    const bad = invalid(p.id, c.member.id)
    return (
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
          'tabular rounded-md border bg-background px-2 text-right outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          key in draft && !bad && 'border-primary/50 bg-primary/5',
          bad && 'border-destructive bg-destructive/5',
          className,
        )}
      />
    )
  }

  /** "Group 2" on a candidate: shows everyone marked together with them. */
  const groupChip = (c: ExamCandidateRow) => {
    const g = c.groupId === null ? undefined : groupById.get(c.groupId)
    if (!g) return null
    return (
      <button
        type="button"
        onClick={() => onGroup(shownGroup?.id === g.id ? null : g.id)}
        title={t('exams.marks.groups.open', { number: g.number })}
        className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-1.5 font-sans text-[11px] font-medium text-brand hover:bg-brand/20"
      >
        <Users className="size-3" aria-hidden />
        {t('exams.marks.groups.name', { number: g.number })}
      </button>
    )
  }

  const removeButton = (c: ExamCandidateRow) => (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => onRemove(c.member)}
      aria-label={t('exams.candidates.removeName', { name: memberFullName(c.member) })}
      title={t('exams.candidates.remove')}
    >
      <UserMinus className="size-4" />
    </Button>
  )

  const cards = (
    <ul className="divide-y">
      {editable && rows.length > 0 && (
        <li className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allShown}
            onChange={toggleShown}
            aria-label={t('exams.marks.group.selectAll')}
            className="size-5 accent-primary"
          />
          {t('exams.marks.group.selectAll')}
        </li>
      )}
      {rows.map((c) => (
        <li key={c.member.id} className={cn('space-y-3 px-3 py-3', selected.has(c.member.id) && 'bg-accent')}>
          <div className="flex items-center gap-2.5">
            {editable && (
              <input
                type="checkbox"
                checked={selected.has(c.member.id)}
                onChange={() => toggle(c.member.id)}
                aria-label={t('exams.marks.group.select', { name: memberFullName(c.member) })}
                className="size-5 shrink-0 accent-primary"
              />
            )}
            <MemberAvatar member={c.member} />
            <div className="min-w-0 flex-1">
              <p className="leading-snug font-medium">{memberFullName(c.member)}</p>
              <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
                {c.member.memberCode}
                {groupChip(c)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="tabular text-base font-semibold">
                {c.total ?? '—'}
                <span className="text-xs font-normal text-muted-foreground">/{totalWeight}</span>
              </span>
              <ExamResultBadge result={c.result} />
            </div>
            {editable && removeButton(c)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {parts.map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background/60 px-2.5 py-1.5">
                <span className="min-w-0 text-xs">
                  <span className="block truncate">{p.name}</span>
                  <span className="tabular text-muted-foreground">/ {p.weight}</span>
                </span>
                {editable ? (
                  scoreInput(c, p, 'h-10 w-16 shrink-0 text-base')
                ) : (
                  <span className="tabular font-medium">{valueOf(p.id, c.member.id) || '—'}</span>
                )}
              </label>
            ))}
          </div>
        </li>
      ))}
      {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('exams.marks.noMatch')}</li>}
    </ul>
  )

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
      {sheet.groups.length > 0 && (
        <div className="border-b px-3 py-2 sm:px-4">
          <div role="group" aria-label={t('exams.marks.groups.show')} className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5">
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden />
              {t('exams.marks.groups.show')}
            </span>
            {[null, ...sheet.groups].map((g) => {
              const on = (shownGroup?.id ?? null) === (g?.id ?? null)
              return (
                <button
                  key={g?.id ?? 'all'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onGroup(g && !on ? g.id : null)}
                  className={cn(
                    'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/40',
                  )}
                >
                  {g ? t('exams.marks.groups.name', { number: g.number }) : t('exams.marks.groups.all')}
                  {g && <span className={cn('tabular', on ? 'opacity-80' : 'text-muted-foreground')}>{g.memberIds.length}</span>}
                </button>
              )
            })}
          </div>
          {shownGroup && (
            <p className="mt-1 text-xs text-muted-foreground">
              <GroupLine group={shownGroup} />
            </p>
          )}
        </div>
      )}
      {editable && selected.size > 0 && (
        <div className="space-y-2 border-b bg-primary/5 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('exams.marks.group.selected', { count: selected.size })}</p>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X />
              {t('exams.marks.group.clear')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('exams.marks.group.hint')}</p>
          <div className="flex flex-wrap items-end gap-3">
            {parts.map((p) => (
              <label key={p.id} className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>
                  <span className="text-foreground">{p.name}</span> <span className="tabular">/ {p.weight}</span>
                </span>
                <input
                  value={groupMarks[p.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    if (SCORE.test(v)) setGroupMarks((g) => ({ ...g, [p.id]: v }))
                  }}
                  inputMode="decimal"
                  aria-invalid={groupBad(p.id) || undefined}
                  className={cn(
                    'tabular h-10 w-20 rounded-md border bg-background px-2 text-right text-base text-foreground outline-none sm:h-8 sm:text-sm',
                    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                    groupBad(p.id) && 'border-destructive bg-destructive/5',
                  )}
                />
              </label>
            ))}
            <Button size="sm" onClick={applyGroup} disabled={!canApply}>
              <CopyCheck />
              {t('exams.marks.group.apply', { count: selected.size })}
            </Button>
          </div>
        </div>
      )}
      {phone ? cards : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card py-2.5 pr-3 pl-4 font-medium">
                <div className="flex items-center gap-2.5">
                  {editable && (
                    <input
                      type="checkbox"
                      checked={allShown}
                      onChange={toggleShown}
                      disabled={rows.length === 0}
                      aria-label={t('exams.marks.group.selectAll')}
                      title={t('exams.marks.group.selectAll')}
                      className="size-4 accent-primary"
                    />
                  )}
                  {t('exams.marks.candidate')}
                </div>
              </th>
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
              <tr key={c.member.id} className={cn('border-b last:border-0', selected.has(c.member.id) && 'bg-accent')}>
                <td className={cn('sticky left-0 z-10 py-2 pr-3 pl-4', selected.has(c.member.id) ? 'bg-accent' : 'bg-card')}>
                  <div className="flex items-center gap-2.5">
                    {editable && (
                      <input
                        type="checkbox"
                        checked={selected.has(c.member.id)}
                        onChange={() => toggle(c.member.id)}
                        aria-label={t('exams.marks.group.select', { name: memberFullName(c.member) })}
                        className="size-4 shrink-0 accent-primary"
                      />
                    )}
                    <MemberAvatar member={c.member} />
                    <div className="min-w-0">
                      <p className="max-w-32 truncate font-medium sm:max-w-56">{memberFullName(c.member)}</p>
                      <p className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        {c.member.memberCode}
                        {groupChip(c)}
                      </p>
                    </div>
                  </div>
                </td>
                {parts.map((p) => (
                  <td key={p.id} className="px-2 py-2 text-center">
                    {editable ? (
                      scoreInput(c, p, 'h-8 w-16')
                    ) : (
                      <span className="tabular">{valueOf(p.id, c.member.id) || '—'}</span>
                    )}
                  </td>
                ))}
                <td className="tabular px-3 py-2 text-right font-semibold">{c.total ?? '—'}</td>
                <td className="py-2 pr-2 pl-2">
                  <ExamResultBadge result={c.result} />
                </td>
                {editable && <td className="py-2 pr-3">{removeButton(c)}</td>}
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
      )}
      {editable && (
        <div className="sticky bottom-[var(--tabs-h,0px)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {hasInvalid
              ? t('exams.marks.fixInvalid')
              : changes.length > 0
                ? t('exams.marks.unsaved', { count: changes.length })
                : t('exams.marks.passMark', { mark: passMark })}
            {!hasInvalid && groupsToSave.length > 0 && (
              <span className="block text-xs text-brand">{t('exams.marks.groups.newGroup', { count: groupsToSave.length })}</span>
            )}
          </p>
          <div className="flex gap-2">
            {(Object.keys(draft).length > 0 || newGroups.length > 0) && (
              <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
                <RotateCcw />
                {t('exams.marks.discard')}
              </Button>
            )}
            <Button size="sm" onClick={() => void save()} disabled={pending || hasInvalid || (changes.length === 0 && groupsToSave.length === 0)}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('exams.marks.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** "5 members · Marked 9 Hidar 2019 by Abebe" */
function GroupLine({ group }: { group: ExamGroup }) {
  const { t } = useTranslation()
  const date = formatDate(group.createdAt)
  return (
    <>
      {t('exams.marks.groups.members', { count: group.memberIds.length })} ·{' '}
      {group.createdBy
        ? t('exams.marks.groups.markedBy', { date, name: group.createdBy })
        : t('exams.marks.groups.marked', { date })}
    </>
  )
}
