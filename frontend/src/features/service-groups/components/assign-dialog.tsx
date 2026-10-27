import { Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocalizedName } from '@/features/classes/use-localized'
import { MemberAvatar } from '@/features/members/components/member-avatar'
import { memberFullName } from '@/features/members/utils'
import { getErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { useGroupCandidates } from '../api'
import type { ServiceGroup } from '../types'
import { useGradeOptions } from '../use-grade-options'

const ALL = '__all__'

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * Pick members (by class and/or name) to put in a group; members in another
 * group are moved. Mount it only while open so each opening starts fresh.
 */
export function AssignDialog({
  open,
  onOpenChange,
  group,
  onAssign,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: ServiceGroup
  onAssign: (memberIds: number[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { options } = useGradeOptions()
  const [gradeId, setGradeId] = useState(group.classGradeId ? String(group.classGradeId) : ALL)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const query = useDebounced(search.trim())
  const { data, isFetching } = useGroupCandidates(
    group.termId,
    { classGradeId: gradeId === ALL ? undefined : Number(gradeId), search: query || undefined },
    open,
  )
  const candidates = (data ?? []).filter((c) => c.group?.id !== group.id)

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const unassigned = candidates.filter((c) => !c.group)
  const allUnassignedSelected = unassigned.length > 0 && unassigned.every((c) => selected.has(c.id))

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await onAssign([...selected])
      onOpenChange(false)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('serviceGroups.assign.title', { group: name(group) })}</DialogTitle>
          <DialogDescription>{t('serviceGroups.assign.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="assign-grade">{t('serviceGroups.fields.classGrade')}</FieldLabel>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger id="assign-grade" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('serviceGroups.assign.anyClass')}</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="assign-search">{t('serviceGroups.assign.search')}</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="assign-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                placeholder={t('serviceGroups.assign.searchPlaceholder')}
              />
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isFetching ? <Loader2 className="inline size-3 animate-spin" /> : t('serviceGroups.assign.found', { count: candidates.length })}
          </span>
          {unassigned.length > 0 && (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  for (const c of unassigned) {
                    if (allUnassignedSelected) next.delete(c.id)
                    else next.add(c.id)
                  }
                  return next
                })
              }
            >
              {allUnassignedSelected ? t('serviceGroups.assign.clearUnassigned') : t('serviceGroups.assign.selectUnassigned', { count: unassigned.length })}
            </button>
          )}
        </div>
        <ul className="-mx-1 min-h-40 flex-1 divide-y overflow-y-auto rounded-md border">
          {candidates.length === 0 && !isFetching && (
            <li className="p-6 text-center text-sm text-muted-foreground">{t('serviceGroups.assign.none')}</li>
          )}
          {candidates.map((c) => (
            <li key={c.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50',
                  selected.has(c.id) && 'bg-accent/40',
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <MemberAvatar member={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{memberFullName(c)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.memberCode}</span>
                </span>
                {c.group && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {t('serviceGroups.assign.inGroup', { group: name(c.group) })}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || selected.size === 0}>
            {pending && <Loader2 className="animate-spin" />}
            {t('serviceGroups.assign.submit', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
