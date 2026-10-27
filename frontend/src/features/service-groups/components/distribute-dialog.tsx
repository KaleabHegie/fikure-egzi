import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useLocalizedName } from '@/features/classes/use-localized'
import { getErrorMessage } from '@/lib/api/errors'
import type { ServiceGroup } from '../types'
import { useGradeOptions } from '../use-grade-options'

/** Spread a class's members evenly across the chosen groups of a term. Mount only while open. */
export function DistributeDialog({
  open,
  onOpenChange,
  groups,
  onDistribute,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: ServiceGroup[]
  onDistribute: (input: { classGradeId: number; groupIds: number[]; onlyUnassigned: boolean }) => Promise<void>
}) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { options, defaultGradeId } = useGradeOptions()
  // Default: the class the groups are drawn from (else Mezmur · Araray), and the groups drawn from it.
  const [gradeId, setGradeId] = useState(() => {
    const grade = groups.find((g) => g.classGradeId)?.classGradeId
    return grade ? String(grade) : defaultGradeId
  })
  const [groupIds, setGroupIds] = useState<Set<number>>(() => {
    const matching = groups.filter((g) => String(g.classGradeId) === gradeId)
    return new Set((matching.length > 0 ? matching : groups).map((g) => g.id))
  })
  const [onlyUnassigned, setOnlyUnassigned] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await onDistribute({ classGradeId: Number(gradeId), groupIds: [...groupIds], onlyUnassigned })
      onOpenChange(false)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('serviceGroups.distribute.title')}</DialogTitle>
          <DialogDescription>{t('serviceGroups.distribute.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="distribute-grade">{t('serviceGroups.fields.classGrade')}</FieldLabel>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger id="distribute-grade" className="w-full">
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('serviceGroups.distribute.groups')}</legend>
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={groupIds.has(g.id)}
                  onChange={() =>
                    setGroupIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(g.id)) next.delete(g.id)
                      else next.add(g.id)
                      return next
                    })
                  }
                />
                <span className="flex-1">{name(g)}</span>
                <span className="tabular text-xs text-muted-foreground">
                  {t('serviceGroups.memberCount', { count: g.members.length })}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <label htmlFor="distribute-only" className="text-sm font-medium">
                {t('serviceGroups.distribute.onlyUnassigned')}
              </label>
              <p className="text-xs text-muted-foreground">
                {onlyUnassigned ? t('serviceGroups.distribute.onlyUnassignedOn') : t('serviceGroups.distribute.onlyUnassignedOff')}
              </p>
            </div>
            <Switch id="distribute-only" checked={onlyUnassigned} onCheckedChange={setOnlyUnassigned} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !gradeId || groupIds.size === 0}>
            {pending && <Loader2 className="animate-spin" />}
            {t('serviceGroups.distribute.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
