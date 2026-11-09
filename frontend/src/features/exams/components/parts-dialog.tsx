import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/api/errors'
import type { ExamPart, ExamPartInput } from '../types'
import { type PartRow, partsProblem, toPartInputs, toPartRows } from '../parts'
import { PartsEditor } from './parts-editor'

/** Edit an exam's parts and weights. A removed part takes its marks with it. */
export function PartsDialog({
  open,
  onOpenChange,
  parts,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parts: ExamPart[]
  onSave: (parts: ExamPartInput[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<PartRow[]>(() => toPartRows(parts))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const removed = parts.filter((p) => !rows.some((r) => r.id === p.id))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = partsProblem(rows)
    if (problem) return setError(t(problem.key as 'exams.duplicatePart', problem.params))
    setPending(true)
    try {
      await onSave(toPartInputs(rows))
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
        if (o) setRows(toPartRows(parts))
        setError(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('exams.parts.title')}</DialogTitle>
          <DialogDescription>{t('exams.parts.body')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <PartsEditor rows={rows} onChange={setRows} />
          {removed.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              {t('exams.parts.removing', { names: removed.map((p) => p.name).join('፣ ') })}
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
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
