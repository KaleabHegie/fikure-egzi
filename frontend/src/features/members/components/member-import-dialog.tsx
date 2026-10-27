import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Upload } from 'lucide-react'
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
import { memberKeys, membersApi } from '../api'
import type { ImportIssue, ImportPreview } from '../types'

/** Excel import as a popup: download template → upload & check → import. */
export function MemberImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const lang: ImportLang = i18n.language === 'en' ? 'en' : 'am'
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<number | null>(null)

  const download = async (l: ImportLang) => {
    try {
      saveBlob(await membersApi.importTemplate(l), `fikure-egzi-members-template-${l}.xlsx`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const check = async (chosen: File) => {
    setFile(chosen)
    setPreview(null)
    setImported(null)
    setChecking(true)
    try {
      setPreview(await membersApi.previewImport(chosen))
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
      const { imported: count } = await membersApi.commitImport(file)
      setImported(count)
      setPreview(null)
      setFile(null)
      void queryClient.invalidateQueries({ queryKey: memberKeys.all })
      toast.success(t('members.import.done', { count }))
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setImported(null)
  }

  const columnLabel = (key: string | null) => {
    if (!key) return null
    const col = preview?.columns.find((c) => c.key === key)
    return col ? col[lang] : key
  }
  const describe = (issue: ImportIssue) => {
    const text = t(`members.import.issues.${issue.code}`, { ...issue.params, message: issue.message ?? '' })
    const column = columnLabel(issue.column)
    return column ? `${column}: ${text}` : text
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let a stray click close the dialog mid-import.
        if (importing) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('members.import.title')}</DialogTitle>
          <DialogDescription>{t('members.import.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ImportStep n={1} title={t('members.import.step1')} body={t('members.import.step1Body')}>
            <TemplateButtons lang={lang} label={t('members.import.download')} onDownload={download} />
          </ImportStep>

          <ImportStep n={2} title={t('members.import.step2')} body={t('members.import.step2Body')} done={Boolean(preview)}>
            <FileDropZone file={file} checking={checking} disabled={importing} onFile={(f) => void check(f)} />
          </ImportStep>

          {imported !== null && (
            <ImportDone
              title={t('members.import.done', { count: imported })}
              body={t('members.import.doneBody')}
              finishLabel={t('members.import.viewMembers')}
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
                <ImportStat label={t('members.import.ready')} value={preview.validRows} tone="good" />
                <ImportStat label={t('members.import.withErrors')} value={preview.errorRows} tone="bad" />
                <ImportStat label={t('members.import.withWarnings')} value={preview.warningRows} tone="warn" />
              </div>

              {preview.errorRows > 0 ? (
                <FixErrorsNotice />
              ) : (
                preview.warningRows > 0 && (
                  <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    {t('members.import.warningsOnly')}
                  </p>
                )
              )}

              <ProblemsTable
                showName
                rows={preview.rows.map((r) => ({
                  row: r.row,
                  name: r.name,
                  errors: r.errors.map(describe),
                  warnings: r.warnings.map(describe),
                }))}
              />

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={reset} disabled={importing}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void commit()} disabled={importing || preview.errorRows > 0 || preview.validRows === 0}>
                  {importing ? <Loader2 className="animate-spin" /> : <Upload />}
                  {importing ? t('members.import.importing') : t('members.import.importN', { count: preview.validRows })}
                </Button>
              </div>
            </ImportStep>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
