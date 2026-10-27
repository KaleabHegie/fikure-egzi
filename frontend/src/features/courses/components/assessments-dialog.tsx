import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { Assessment } from '../types'

interface Row {
  key: string
  id?: number
  name: string
  maxScore: string
}

const toRows = (list: Assessment[]): Row[] =>
  list.map((a) => ({ key: `a${a.id}`, id: a.id, name: a.name, maxScore: String(a.maxScore) }))

let next = 0
const blank = (name = '', maxScore = ''): Row => ({ key: `n${next++}`, name, maxScore })

const SCORE = /^\d{1,3}(\.\d{1,2})?$/

/**
 * The marked work of a run (e.g. Quiz 20, Mid exam 30, Final 50). Maxima add
 * up to at most 100; results are worked out once they reach exactly 100.
 */
export function AssessmentsDialog({
  open,
  onOpenChange,
  assessments,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assessments: Assessment[]
  onSave: (list: { id?: number; name: string; maxScore: number }[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Row[]>(() => toRows(assessments))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const total = rows.reduce((sum, r) => sum + (SCORE.test(r.maxScore) ? Number(r.maxScore) : 0), 0)
  const removed = assessments.filter((a) => !rows.some((r) => r.id === a.id))
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (rows.some((r) => !r.name.trim())) return setError(t('courses.assessments.nameRequired'))
    if (rows.some((r) => !SCORE.test(r.maxScore) || Number(r.maxScore) <= 0)) return setError(t('courses.assessments.maxInvalid'))
    if (total > 100) return setError(t('courses.totalOver', { total }))
    setPending(true)
    try {
      await onSave(rows.map((r) => ({ ...(r.id !== undefined && { id: r.id }), name: r.name.trim(), maxScore: Number(r.maxScore) })))
      onOpenChange(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setRows(toRows(assessments))
        setError(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('courses.assessments.title')}</DialogTitle>
          <DialogDescription>{t('courses.assessments.body')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          {rows.length === 0 ? (
            <div className="grid gap-3 rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('courses.assessments.empty')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-center"
                onClick={() =>
                  setRows([
                    blank(t('courses.assessments.preset.quiz'), '20'),
                    blank(t('courses.assessments.preset.mid'), '30'),
                    blank(t('courses.assessments.preset.final'), '50'),
                  ])
                }
              >
                {t('courses.assessments.usePreset')}
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_5.5rem_2.25rem] gap-2 px-0.5 text-xs font-medium text-muted-foreground">
                <span>{t('courses.assessments.name')}</span>
                <span>{t('courses.assessments.max')}</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={r.key} className="grid grid-cols-[1fr_5.5rem_2.25rem] items-center gap-2">
                  <Input
                    value={r.name}
                    onChange={(e) => set(r.key, { name: e.target.value })}
                    placeholder={t('courses.assessments.namePlaceholder')}
                    aria-label={`${t('courses.assessments.name')} ${i + 1}`}
                    maxLength={100}
                  />
                  <Input
                    value={r.maxScore}
                    onChange={(e) => set(r.key, { maxScore: e.target.value.replace(/[^\d.]/g, '') })}
                    inputMode="decimal"
                    className="tabular text-right"
                    aria-label={`${t('courses.assessments.max')} ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={t('courses.assessments.remove', { name: r.name || i + 1 })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank()])} disabled={rows.length >= 20}>
              <Plus />
              {t('courses.assessments.add')}
            </Button>
            <p
              className={cn(
                'tabular text-sm font-medium',
                total > 100 ? 'text-destructive' : total === 100 ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {t('courses.assessments.total', { total })}
            </p>
          </div>
          {total > 0 && total < 100 && <p className="-mt-2 text-xs text-muted-foreground">{t('courses.assessments.under100')}</p>}
          {removed.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              {t('courses.assessments.removing', { names: removed.map((a) => a.name).join('، ') })}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {t('courses.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
