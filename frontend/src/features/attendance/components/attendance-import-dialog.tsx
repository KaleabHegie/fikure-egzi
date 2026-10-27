import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  FileDropZone,
  FixErrorsNotice,
  ImportDone,
  type ImportLang,
  ImportStat,
  ImportStep,
  ProblemsTable,
  TemplateButtons,
} from '@/components/import/import-steps'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getErrorMessage } from '@/lib/api/errors'
import { saveBlob } from '@/lib/download'
import { formatDate, formatTime } from '@/lib/format'
import { attendanceKeys } from '../api'
import { type AttendanceImportPreview, attendanceImportApi } from '../import-api'
import { useProblemRows } from './import-issues'

/** Session list import, same steps as the member import: template → upload & check → create. */
export function AttendanceImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const lang: ImportLang = i18n.language === 'en' ? 'en' : 'am'
  const problemRows = useProblemRows()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<AttendanceImportPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [created, setCreated] = useState<number | null>(null)

  const download = async (l: ImportLang) => {
    try {
      saveBlob(await attendanceImportApi.template(l), `fikure-egzi-sessions-template-${l}.xlsx`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const check = async (chosen: File) => {
    setFile(chosen)
    setPreview(null)
    setCreated(null)
    setChecking(true)
    try {
      setPreview(await attendanceImportApi.preview(chosen, lang))
    } catch (e) {
      toast.error(getErrorMessage(e))
      setFile(null)
    } finally {
      setChecking(false)
    }
  }

  const commit = async () => {
    if (!file) return
    setImporting(true)
    try {
      const r = await attendanceImportApi.commit(file, lang)
      setCreated(r.created)
      setPreview(null)
      setFile(null)
      void qc.invalidateQueries({ queryKey: attendanceKeys.all })
      toast.success(t('attendance.import.imported', { count: r.created }))
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setCreated(null)
  }

  const fresh = preview?.sessions.filter((s) => !s.existing).length ?? 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importing) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('attendance.import.title')}</DialogTitle>
          <DialogDescription>{t('attendance.import.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ImportStep n={1} title={t('members.import.step1')} body={t('attendance.import.step1')}>
            <TemplateButtons lang={lang} label={t('attendance.import.downloadTemplate')} onDownload={download} />
          </ImportStep>

          <ImportStep n={2} title={t('members.import.step2')} body={t('attendance.import.step2')} done={Boolean(preview)}>
            <FileDropZone file={file} checking={checking} disabled={importing} onFile={(f) => void check(f)} />
          </ImportStep>

          {created !== null && (
            <ImportDone
              title={t('attendance.import.imported', { count: created })}
              body={t('attendance.import.doneBody')}
              finishLabel={t('attendance.import.viewSessions')}
              onAgain={reset}
              onFinish={() => {
                reset()
                onOpenChange(false)
              }}
            />
          )}

          {preview && (
            <ImportStep n={3} title={t('members.import.step3')}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ImportStat label={t('members.import.rows')} value={preview.totalRows} />
                <ImportStat label={t('attendance.import.newSessions')} value={fresh} tone="good" />
                <ImportStat label={t('attendance.import.existingSessions')} value={preview.sessions.length - fresh} />
                <ImportStat label={t('members.import.withErrors')} value={preview.errorRows} tone="bad" />
              </div>

              {preview.errorRows > 0 && <FixErrorsNotice />}
              <ProblemsTable rows={problemRows(preview.rows)} />

              {preview.errorRows === 0 && preview.sessions.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16">{t('members.import.row')}</TableHead>
                        <TableHead>{t('attendance.fields.date')}</TableHead>
                        <TableHead>{t('attendance.fields.title')}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t('attendance.import.time')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sessions.map((s) => (
                        <TableRow key={s.row} className={s.existing ? 'text-muted-foreground' : undefined}>
                          <TableCell className="tabular font-mono text-xs">{s.row}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(s.date)}</TableCell>
                          <TableCell className="text-sm">
                            {s.title}
                            <span className="block text-xs text-muted-foreground">
                              {t(`attendance.kinds.${s.kind}`)}
                              {s.existing && ` · ${t('attendance.import.alreadyExists')}`}
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-sm whitespace-nowrap sm:table-cell">
                            {formatTime(s.start)} – {formatTime(s.end)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={reset} disabled={importing}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void commit()} disabled={importing || preview.errorRows > 0 || fresh === 0}>
                  {importing ? <Loader2 className="animate-spin" /> : <Upload />}
                  {importing ? t('members.import.importing') : t('attendance.import.importN', { count: fresh })}
                </Button>
              </div>
            </ImportStep>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
