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
import { getErrorMessage } from '@/lib/api/errors'
import { saveBlob } from '@/lib/download'
import { attendanceKeys } from '../api'
import { attendanceImportApi, type SheetPreview } from '../import-api'
import { useProblemRows } from './import-issues'

/** Fill a session from Excel, same steps as the member import: list → upload & check → save. */
export function SessionSheetDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const lang: ImportLang = i18n.language === 'en' ? 'en' : 'am'
  const problemRows = useProblemRows()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<SheetPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)

  const download = async (l: ImportLang) => {
    try {
      saveBlob(await attendanceImportApi.sheet(sessionId, l), `attendance-session-${sessionId}-${l}.xlsx`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const check = async (chosen: File) => {
    setFile(chosen)
    setPreview(null)
    setSaved(null)
    setChecking(true)
    try {
      setPreview(await attendanceImportApi.previewSheet(sessionId, chosen))
    } catch (e) {
      toast.error(getErrorMessage(e))
      setFile(null)
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    if (!file) return
    setSaving(true)
    try {
      const r = await attendanceImportApi.saveSheet(sessionId, file)
      setSaved(r.saved)
      setPreview(null)
      setFile(null)
      void qc.invalidateQueries({ queryKey: attendanceKeys.all })
      toast.success(t('attendance.import.saved', { count: r.saved }))
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setSaved(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('attendance.import.sheetTitle')}</DialogTitle>
          <DialogDescription>{t('attendance.import.sheetDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ImportStep n={1} title={t('attendance.import.downloadSheet')} body={t('attendance.import.sheetStep1')}>
            <TemplateButtons lang={lang} label={t('attendance.import.downloadSheet')} onDownload={download} />
          </ImportStep>

          <ImportStep n={2} title={t('members.import.step2')} body={t('attendance.import.sheetStep2')} done={Boolean(preview)}>
            <FileDropZone file={file} checking={checking} disabled={saving} onFile={(f) => void check(f)} />
          </ImportStep>

          {saved !== null && (
            <ImportDone
              title={t('attendance.import.saved', { count: saved })}
              body={t('attendance.import.sheetDoneBody')}
              finishLabel={t('attendance.import.backToSession')}
              onAgain={reset}
              onFinish={() => {
                reset()
                onOpenChange(false)
              }}
            />
          )}

          {preview && (
            <ImportStep n={3} title={t('members.import.step3')}>
              <div className="grid grid-cols-3 gap-3">
                <ImportStat label={t('members.import.rows')} value={preview.totalRows} />
                <ImportStat label={t('members.import.ready')} value={preview.toSave} tone="good" />
                <ImportStat label={t('members.import.withErrors')} value={preview.errorRows} tone="bad" />
              </div>
              {preview.errorRows > 0 && <FixErrorsNotice />}
              <ProblemsTable rows={problemRows(preview.rows)} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={reset} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void save()} disabled={saving || preview.errorRows > 0 || preview.toSave === 0}>
                  {saving ? <Loader2 className="animate-spin" /> : <Upload />}
                  {t('attendance.import.saveN', { count: preview.toSave })}
                </Button>
              </div>
            </ImportStep>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
