import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/*
 * Building blocks shared by every Excel import (members, attendance sheets,
 * session lists) so they all look and work the same:
 * download template → drop the file → review → import.
 */

export type ImportLang = 'am' | 'en'

export function ImportStep({
  n,
  title,
  body,
  done,
  children,
}: {
  n: number
  title: string
  body?: string
  done?: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border p-4 sm:p-5">
      <div className="flex gap-4">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold',
            done ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
          )}
        >
          {done ? <CheckCircle2 className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="font-medium">{title}</h2>
            {body && <p className="text-sm text-muted-foreground">{body}</p>}
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}

export function ImportStat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular text-2xl font-semibold',
          tone === 'good' && 'text-success',
          tone === 'bad' && value > 0 && 'text-destructive',
          tone === 'warn' && value > 0 && 'text-warning',
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  )
}

/** Step 1: the template in the UI language, plus a link for the other language. */
export function TemplateButtons({
  lang,
  label,
  onDownload,
}: {
  lang: ImportLang
  label: string
  onDownload: (lang: ImportLang) => Promise<void>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<ImportLang | null>(null)
  const other: ImportLang = lang === 'am' ? 'en' : 'am'
  const run = async (l: ImportLang) => {
    setBusy(l)
    try {
      await onDownload(l)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void run(lang)} disabled={busy !== null}>
        {busy === lang ? <Loader2 className="animate-spin" /> : <Download />}
        {label}
      </Button>
      <Button variant="link" onClick={() => void run(other)} disabled={busy !== null}>
        {busy === other && <Loader2 className="animate-spin" />}
        {t('members.import.downloadOther')}
      </Button>
    </div>
  )
}

/** Step 2: drop or choose the filled-in .xlsx. */
export function FileDropZone({
  file,
  checking,
  disabled,
  onFile,
}: {
  file: File | null
  checking: boolean
  disabled?: boolean
  onFile: (file: File) => void
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) onFile(dropped)
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
        dragging ? 'border-primary bg-accent' : 'hover:bg-muted/50',
      )}
    >
      {checking ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : (
        <FileSpreadsheet className="size-6 text-muted-foreground" />
      )}
      <span className="text-sm">
        {checking ? t('members.import.checking') : file ? file.name : t('members.import.dropHint')}
      </span>
      {!checking && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <Upload className="size-3.5" />
          {t('members.import.choose')}
        </span>
      )}
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={checking || disabled}
        onChange={(e) => {
          const chosen = e.target.files?.[0]
          e.target.value = ''
          if (chosen) onFile(chosen)
        }}
      />
    </label>
  )
}

/** "Fix the rows below…" — shown in step 3 when anything blocks the import. */
export function FixErrorsNotice() {
  const { t } = useTranslation()
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <XCircle className="mt-0.5 size-4 shrink-0" />
      {t('members.import.fixErrors')}
    </p>
  )
}

export interface ProblemRow {
  row: number
  name?: string
  errors: string[]
  warnings?: string[]
}

/** Row-by-row problems, as the user sees the rows in Excel. */
export function ProblemsTable({ rows, showName = false }: { rows: ProblemRow[]; showName?: boolean }) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-16">{t('members.import.row')}</TableHead>
            {showName && <TableHead className="w-48">{t('members.import.name')}</TableHead>}
            <TableHead>{t('members.import.problems')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.row} className="align-top">
              <TableCell className="tabular font-mono text-xs">{r.row}</TableCell>
              {showName && <TableCell className="font-medium">{r.name || t('members.import.noName')}</TableCell>}
              <TableCell>
                <ul className="space-y-1 text-sm">
                  {r.errors.map((text, i) => (
                    <li key={`e${i}`} className="flex gap-2 text-destructive">
                      <XCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span>{text}</span>
                    </li>
                  ))}
                  {r.warnings?.map((text, i) => (
                    <li key={`w${i}`} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Shown after a successful import. */
export function ImportDone({
  title,
  body,
  finishLabel,
  onAgain,
  onFinish,
}: {
  title: string
  body: string
  finishLabel: string
  onAgain: () => void
  onFinish: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-6 sm:flex-row sm:items-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onAgain}>
          {t('members.import.importAnother')}
        </Button>
        <Button onClick={onFinish}>{finishLabel}</Button>
      </div>
    </section>
  )
}
