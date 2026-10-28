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
import { courseKeys, type MarkSheetPreview, markSheetApi } from '../api'

/** Fill a run's marks from Excel, same steps as the other imports: download → upload & check → save. */
export function MarksImportDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const lang: ImportLang = i18n.language === 'en' ? 'en' : 'am'
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MarkSheetPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)
  // Issue keys are dynamic but always exist in the locale files (courses.import.issues.*).
  const tr = t as unknown as (key: string, options?: Record<string, unknown>) => string

  const download = async (l: ImportLang) => {
    try {
      saveBlob(await markSheetApi.download(runId, l), `course-run-${runId}-marks-${l}.xlsx`)
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
      setPreview(await markSheetApi.preview(runId, chosen))
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
      const r = await markSheetApi.save(runId, file)
      setSaved(r.saved)
      setPreview(null)
      setFile(null)
      void qc.invalidateQueries({ queryKey: courseKeys.all })
      toast.success(t('courses.import.saved', { count: r.saved }))
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

  const problems = (preview?.rows ?? []).map((r) => ({
    row: r.row,
    errors: r.errors.map(
      (e) =>
        `${e.column === 'code' ? t('courses.import.memberId') : e.column}: ${tr(`courses.import.issues.${e.code}`, e.params)}`,
    ),
  }))

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
          <DialogTitle>{t('courses.import.title')}</DialogTitle>
          <DialogDescription>{t('courses.import.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ImportStep n={1} title={t('courses.import.download')} body={t('courses.import.step1')}>
            <TemplateButtons lang={lang} label={t('courses.import.download')} onDownload={download} />
          </ImportStep>

          <ImportStep n={2} title={t('members.import.step2')} body={t('courses.import.step2')} done={Boolean(preview)}>
            <FileDropZone file={file} checking={checking} disabled={saving} onFile={(f) => void check(f)} />
          </ImportStep>

          {saved !== null && (
            <ImportDone
              title={t('courses.import.saved', { count: saved })}
              body={t('courses.import.doneBody')}
              finishLabel={t('courses.import.backToRun')}
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
                <ImportStat label={t('courses.import.students')} value={preview.students} />
                <ImportStat label={t('courses.import.marks')} value={preview.toSave} tone="good" />
                <ImportStat label={t('members.import.withErrors')} value={preview.errorRows} tone="bad" />
              </div>
              {preview.errorRows > 0 && <FixErrorsNotice />}
              <ProblemsTable rows={problems} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={reset} disabled={saving}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void save()} disabled={saving || preview.errorRows > 0 || preview.toSave === 0}>
                  {saving ? <Loader2 className="animate-spin" /> : <Upload />}
                  {t('courses.import.saveN', { count: preview.toSave })}
                </Button>
              </div>
            </ImportStep>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
